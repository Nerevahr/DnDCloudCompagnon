'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient } from '../../lib/dynamoClient';

const ddbMock = mockClient(docClient);

const rawSpells = [
    { PK: 'SPELL#boule-de-feu', SK: 'METADATA', Name: 'Boule de feu', School: 'Évocation', Level: 3, Classes: ['Magicien'], Tags: ['Dégâts', 'Zone'] },
    { PK: 'SPELL#lumiere', SK: 'METADATA', Name: 'Lumière', School: 'Évocation', Level: 0, Classes: ['Clerc', 'Magicien'], Tags: ['Utilitaire'] }
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
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        const result = await lambdaHandler(buildEvent());

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.a('string');
        expect(result.headers?.['Cache-Control']).to.be.undefined;

        const response = JSON.parse(result.body as string);

        expect(response).to.be.an('object');
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: 'none', tag: 'none' });
        expect(response.count).to.equal(2);
        expect(response.spells).to.deep.equal([
            {
                id: 'boule-de-feu',
                Name: 'Boule de feu',
                School: 'Évocation',
                Level: 3,
                Classes: ['Magicien'],
                Tags: ['Dégâts', 'Zone'],
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/spells/boule-de-feu'
            },
            {
                id: 'lumiere',
                Name: 'Lumière',
                School: 'Évocation',
                Level: 0,
                Classes: ['Clerc', 'Magicien'],
                Tags: ['Utilitaire'],
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/spells/lumiere'
            }
        ]);
    });

    it('only requests minimal fields from DynamoDB via a projection expression', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        await lambdaHandler(buildEvent());

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ProjectionExpression).to.equal('PK, #pName, #pLevel, #pSchool, #pClasses, #pTags');
        expect(input.ExpressionAttributeNames).to.deep.include({
            '#pName': 'Name',
            '#pLevel': 'Level',
            '#pSchool': 'School',
            '#pClasses': 'Classes',
            '#pTags': 'Tags'
        });
    });

    it('applies the school filter to the DynamoDB scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 1, Items: [rawSpells[0]] });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { school: 'Évocation' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Évocation'], level: 'none', class: 'none', tag: 'none' });
        expect(response.count).to.equal(1);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        expect(scanCalls[0].args[0].input.ExpressionAttributeValues?.[':school0']).to.equal('Évocation');
    });

    it('applies multiple school filters (comma-separated, as merged by API Gateway HTTP API) to the scan', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 2, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { school: 'Illusion,Conjuration' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Illusion', 'Conjuration'], level: 'none', class: 'none', tag: 'none' });

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':school0']).to.equal('Illusion');
        expect(input.ExpressionAttributeValues?.[':school1']).to.equal('Conjuration');
        expect(input.ExpressionAttributeNames?.['#school']).to.equal('School');
        expect(input.FilterExpression).to.include('#school IN (:school0, :school1)');
    });

    it('applies the level filter to the DynamoDB scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 1, Items: [rawSpells[0]] });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { level: '3' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: [3], class: 'none', tag: 'none' });
        expect(response.count).to.equal(1);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':level0']).to.equal(3);
        expect(input.ExpressionAttributeNames?.['#level']).to.equal('Level');
        expect(input.FilterExpression).to.include('#level IN (:level0)');
    });

    it('applies multiple level filters and combines them with the school filter', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 2, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { school: 'Évocation', level: '0,3' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Évocation'], level: [0, 3], class: 'none', tag: 'none' });

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':school0']).to.equal('Évocation');
        expect(input.ExpressionAttributeValues?.[':level0']).to.equal(0);
        expect(input.ExpressionAttributeValues?.[':level1']).to.equal(3);
        expect(input.FilterExpression).to.include('#school IN (:school0)');
        expect(input.FilterExpression).to.include('#level IN (:level0, :level1)');
    });

    it('applies the class filter to the DynamoDB scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 1, Items: [rawSpells[0]] });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { class: 'Clerc' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: ['Clerc'], tag: 'none' });
        expect(response.count).to.equal(1);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':class0']).to.equal('Clerc');
        expect(input.ExpressionAttributeNames?.['#class']).to.equal('Classes');
        expect(input.FilterExpression).to.include('(contains(#class, :class0))');
    });

    it('applies multiple class filters (comma-separated) combined with an OR on the scan', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 2, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { class: 'Clerc,Druide' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: ['Clerc', 'Druide'], tag: 'none' });

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':class0']).to.equal('Clerc');
        expect(input.ExpressionAttributeValues?.[':class1']).to.equal('Druide');
        expect(input.FilterExpression).to.include('(contains(#class, :class0) OR contains(#class, :class1))');
    });

    it('applies the tag filter to the DynamoDB scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 1, Items: [rawSpells[0]] });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { tag: 'Zone' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: 'none', tag: ['Zone'] });
        expect(response.count).to.equal(1);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':tag0']).to.equal('Zone');
        expect(input.ExpressionAttributeNames?.['#tag']).to.equal('Tags');
        expect(input.FilterExpression).to.include('(contains(#tag, :tag0))');
    });

    it('applies multiple tag filters (comma-separated) combined with an OR on the scan', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 2, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { tag: 'Zone,Utilitaire' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: 'none', tag: ['Zone', 'Utilitaire'] });

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':tag0']).to.equal('Zone');
        expect(input.ExpressionAttributeValues?.[':tag1']).to.equal('Utilitaire');
        expect(input.FilterExpression).to.include('(contains(#tag, :tag0) OR contains(#tag, :tag1))');
    });

    it('returns a 500 response when DynamoDB fails', async () => {
        ddbMock.on(ScanCommand).rejects(new Error('boom'));

        const result = await lambdaHandler(buildEvent());

        expect(result.statusCode).to.equal(500);

        const response = JSON.parse(result.body as string);
        expect(response.error).to.equal('Impossible de récupérer les sorts');
        expect(response.details).to.equal('boom');
        expect(result.headers?.['Cache-Control']).to.be.undefined;
    });

    it('sorts spells by level when sort=level is provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'level' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('level');
        expect(response.spells.map((spell: { Name: string }) => spell.Name)).to.deep.equal(['Lumière', 'Boule de feu']);
    });

    it('sorts spells alphabetically when sort=name is provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'name' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('name');
        expect(response.spells.map((spell: { Name: string }) => spell.Name)).to.deep.equal(['Boule de feu', 'Lumière']);
    });

    it('ignores an unknown sort value and leaves the scan order untouched', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'popularity' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('none');
        expect(response.spells.map((spell: { Name: string }) => spell.Name)).to.deep.equal(['Boule de feu', 'Lumière']);
    });

    describe('GET /spells/{id}', function () {
        const fullSpell = {
            PK: 'SPELL#boule-de-feu',
            SK: 'METADATA',
            Name: 'Boule de feu',
            School: 'Évocation',
            Level: 3,
            Classes: ['Magicien'],
            Range: '45 mètres',
            Description: 'Une boule de feu explose...'
        };

        it('returns the full detail of a spell, including a self link', async () => {
            ddbMock.on(GetCommand).resolves({ Item: fullSpell });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'boule-de-feu' } }));

            expect(result.statusCode).to.equal(200);

            const response = JSON.parse(result.body as string);
            expect(response).to.deep.equal({
                id: 'boule-de-feu',
                Name: 'Boule de feu',
                School: 'Évocation',
                Level: 3,
                Classes: ['Magicien'],
                Range: '45 mètres',
                Description: 'Une boule de feu explose...',
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/spells/boule-de-feu'
            });
            expect(result.headers?.['Cache-Control']).to.be.undefined;

            const getCalls = ddbMock.commandCalls(GetCommand);
            expect(getCalls).to.have.lengthOf(1);
            expect(getCalls[0].args[0].input.Key).to.deep.equal({ PK: 'SPELL#boule-de-feu', SK: 'METADATA' });
        });

        it('returns a 404 response when the spell does not exist', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'sort-inconnu' } }));

            expect(result.statusCode).to.equal(404);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.include('sort-inconnu');
            expect(result.headers?.['Cache-Control']).to.be.undefined;
        });

        it('returns a 500 response when DynamoDB fails', async () => {
            ddbMock.on(GetCommand).rejects(new Error('boom'));

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'boule-de-feu' } }));

            expect(result.statusCode).to.equal(500);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.equal('Impossible de récupérer le sort');
            expect(response.details).to.equal('boom');
        });
    });
});
