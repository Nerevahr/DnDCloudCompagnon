'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient } from '@dndcloud/core';

const ddbMock = mockClient(docClient);

const rawItems = [
    {
        PK: 'ITEM#baton-de-combat',
        SK: 'METADATA',
        Name: 'Bâton de combat',
        Type: 'Arme',
        WeaponType: 'Arme courante de corps à corps',
        DamageDice: '1d6',
        DamageType: 'Contondant'
    },
    {
        PK: 'ITEM#chemise-de-maille',
        SK: 'METADATA',
        Name: 'Chemise de maille',
        Type: 'Armure',
        ArmorCategory: 'Intermédiaire',
        BaseArmorClass: 13
    }
];

const baseEvent = {
    headers: { 'x-forwarded-proto': 'https' },
    requestContext: {
        domainName: '1234567890.execute-api.eu-west-3.amazonaws.com',
        stage: 'prod'
    }
};

function buildEvent(overrides: Record<string, unknown> = {}): APIGatewayProxyEventV2 {
    return { ...baseEvent, queryStringParameters: null, pathParameters: null, ...overrides } as unknown as APIGatewayProxyEventV2;
}

describe('Tests index', function () {
    beforeEach(() => {
        ddbMock.reset();
    });

    it('verifies successful response without filter', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent());

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.a('string');

        const response = JSON.parse(result.body as string);

        expect(response).to.be.an('object');
        expect(response.filterApplied).to.deep.equal({ type: 'none' });
        expect(response.count).to.equal(2);
        expect(response.items).to.deep.equal([
            {
                id: 'baton-de-combat',
                Name: 'Bâton de combat',
                Type: 'Arme',
                WeaponType: 'Arme courante de corps à corps',
                DamageDice: '1d6',
                DamageType: 'Contondant',
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/items/baton-de-combat'
            },
            {
                id: 'chemise-de-maille',
                Name: 'Chemise de maille',
                Type: 'Armure',
                ArmorCategory: 'Intermédiaire',
                BaseArmorClass: 13,
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/items/chemise-de-maille'
            }
        ]);
    });

    it('only requests useful fields from DynamoDB via a projection expression', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        await lambdaHandler(buildEvent());

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ProjectionExpression).to.equal(
            'PK, #pName, #pType, WeaponType, DamageDice, DamageType, ArmorCategory, BaseArmorClass'
        );
        expect(input.ExpressionAttributeNames).to.deep.include({
            '#pName': 'Name',
            '#pType': 'Type'
        });
    });

    it('applies the type filter after the scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { type: 'arme' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ type: ['arme'] });
        expect(response.count).to.equal(1);
        expect(response.items.map((item: { Name: string }) => item.Name)).to.deep.equal(['Bâton de combat']);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        expect(scanCalls[0].args[0].input.ExpressionAttributeValues).to.deep.equal({
            ':prefix': 'ITEM#',
            ':metadata': 'METADATA'
        });
    });

    it('applies multiple type filters (comma-separated, as merged by API Gateway HTTP API)', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { type: 'arme,armure' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ type: ['arme', 'armure'] });
        expect(response.count).to.equal(2);
    });

    it('ignores accents and case when filtering by type', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { type: 'ARMURE' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(1);
        expect(response.items.map((item: { Name: string }) => item.Name)).to.deep.equal(['Chemise de maille']);
    });

    it('matches a partial type filter (e.g. "arm" matches both "Arme" and "Armure")', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { type: 'arm' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(2);
    });

    it('returns a 500 response when DynamoDB fails', async () => {
        ddbMock.on(ScanCommand).rejects(new Error('boom'));

        const result = await lambdaHandler(buildEvent());

        expect(result.statusCode).to.equal(500);

        const response = JSON.parse(result.body as string);
        expect(response.error).to.equal('Impossible de récupérer les objets');
        expect(response.details).to.equal('boom');
    });

    it('sorts items alphabetically when sort=name is provided', async () => {
        const reversed = [rawItems[1], rawItems[0]];
        ddbMock.on(ScanCommand).resolves({ Count: reversed.length, Items: reversed });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'name' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('name');
        expect(response.items.map((item: { Name: string }) => item.Name)).to.deep.equal([
            'Bâton de combat',
            'Chemise de maille'
        ]);
    });

    it('ignores an unknown sort value and leaves the scan order untouched', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawItems.length, Items: rawItems });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'type' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('none');
        expect(response.items.map((item: { Name: string }) => item.Name)).to.deep.equal([
            'Bâton de combat',
            'Chemise de maille'
        ]);
    });

    describe('GET /items/{id}', function () {
        const fullItem = {
            PK: 'ITEM#baton-de-combat',
            SK: 'METADATA',
            Name: 'Bâton de combat',
            Type: 'Arme',
            Description: 'Une arme de mêlée simple.',
            WeaponType: 'Arme courante de corps à corps',
            DamageDice: '1d6',
            DamageType: 'Contondant'
        };

        it('returns the full detail of an item, including a self link', async () => {
            ddbMock.on(GetCommand).resolves({ Item: fullItem });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'baton-de-combat' } }));

            expect(result.statusCode).to.equal(200);

            const response = JSON.parse(result.body as string);
            expect(response).to.deep.equal({
                id: 'baton-de-combat',
                Name: 'Bâton de combat',
                Type: 'Arme',
                Description: 'Une arme de mêlée simple.',
                WeaponType: 'Arme courante de corps à corps',
                DamageDice: '1d6',
                DamageType: 'Contondant',
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/items/baton-de-combat'
            });

            const getCalls = ddbMock.commandCalls(GetCommand);
            expect(getCalls).to.have.lengthOf(1);
            expect(getCalls[0].args[0].input.Key).to.deep.equal({ PK: 'ITEM#baton-de-combat', SK: 'METADATA' });
        });

        it('returns a 404 response when the item does not exist', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'objet-inconnu' } }));

            expect(result.statusCode).to.equal(404);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.include('objet-inconnu');
        });

        it('returns a 500 response when DynamoDB fails', async () => {
            ddbMock.on(GetCommand).rejects(new Error('boom'));

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'baton-de-combat' } }));

            expect(result.statusCode).to.equal(500);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.equal("Impossible de récupérer l'objet");
            expect(response.details).to.equal('boom');
        });
    });
});
