'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient } from '../../lib/dynamoClient';

const ddbMock = mockClient(docClient);

const rawFeats = [
    { PK: 'FEAT#chanceux', SK: 'METADATA', Name: 'Chanceux', Category: "don d'origine", Prerequisites: [] },
    { PK: 'FEAT#athlete', SK: 'METADATA', Name: 'Athlète', Category: 'don général', Prerequisites: [{ Type: 'niveau', Value: '4' }] }
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
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent());

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.a('string');

        const response = JSON.parse(result.body as string);

        expect(response).to.be.an('object');
        expect(response.filterApplied).to.deep.equal({ category: 'none' });
        expect(response.count).to.equal(2);
        expect(response.feats).to.deep.equal([
            {
                id: 'chanceux',
                Name: 'Chanceux',
                Category: "don d'origine",
                Prerequisites: [],
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/feats/chanceux'
            },
            {
                id: 'athlete',
                Name: 'Athlète',
                Category: 'don général',
                Prerequisites: [{ Type: 'niveau', Value: '4' }],
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/feats/athlete'
            }
        ]);
    });

    it('only requests minimal fields from DynamoDB via a projection expression', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        await lambdaHandler(buildEvent());

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ProjectionExpression).to.equal('PK, #pName, #pCategory, #pPrerequisites');
        expect(input.ExpressionAttributeNames).to.deep.include({
            '#pName': 'Name',
            '#pCategory': 'Category',
            '#pPrerequisites': 'Prerequisites'
        });
    });

    it('applies the category filter after the scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'origine' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ category: ['origine'] });
        expect(response.count).to.equal(1);
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Chanceux']);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        expect(scanCalls[0].args[0].input.ExpressionAttributeValues).to.deep.equal({
            ':prefix': 'FEAT#',
            ':metadata': 'METADATA'
        });
    });

    it('applies multiple category filters (comma-separated, as merged by API Gateway HTTP API)', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'origine,general' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ category: ['origine', 'general'] });
        expect(response.count).to.equal(2);
    });

    it('ignores accents and case when filtering by category', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'GENERAL' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(1);
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Athlète']);
    });

    it('no longer matches the old verbose form including the "don" prefix', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'don général' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(0);
    });

    it('matches a category filter without the "don" prefix (e.g. "general" instead of "don général")', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'general' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(1);
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Athlète']);
    });

    it('matches a category filter without the "don d\'" prefix (e.g. "origine" instead of "don d\'origine")', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { category: 'origine' } }));

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.count).to.equal(1);
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Chanceux']);
    });

    it('returns a 500 response when DynamoDB fails', async () => {
        ddbMock.on(ScanCommand).rejects(new Error('boom'));

        const result = await lambdaHandler(buildEvent());

        expect(result.statusCode).to.equal(500);

        const response = JSON.parse(result.body as string);
        expect(response.error).to.equal('Impossible de récupérer les dons');
        expect(response.details).to.equal('boom');
    });

    it('sorts feats alphabetically when sort=name is provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'name' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('name');
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Athlète', 'Chanceux']);
    });

    it('ignores an unknown sort value and leaves the scan order untouched', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawFeats.length, Items: rawFeats });

        const result = await lambdaHandler(buildEvent({ queryStringParameters: { sort: 'level' } }));

        const response = JSON.parse(result.body as string);
        expect(response.sortApplied).to.equal('none');
        expect(response.feats.map((feat: { Name: string }) => feat.Name)).to.deep.equal(['Chanceux', 'Athlète']);
    });

    describe('GET /feats/{id}', function () {
        const fullFeat = {
            PK: 'FEAT#chanceux',
            SK: 'METADATA',
            Name: 'Chanceux',
            Category: "don d'origine",
            Prerequisites: [],
            Description: 'Vous bénéficiez des avantages suivants...'
        };

        it('returns the full detail of a feat, including a self link', async () => {
            ddbMock.on(GetCommand).resolves({ Item: fullFeat });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'chanceux' } }));

            expect(result.statusCode).to.equal(200);

            const response = JSON.parse(result.body as string);
            expect(response).to.deep.equal({
                id: 'chanceux',
                Name: 'Chanceux',
                Category: "don d'origine",
                Prerequisites: [],
                Description: 'Vous bénéficiez des avantages suivants...',
                _self: 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/feats/chanceux'
            });

            const getCalls = ddbMock.commandCalls(GetCommand);
            expect(getCalls).to.have.lengthOf(1);
            expect(getCalls[0].args[0].input.Key).to.deep.equal({ PK: 'FEAT#chanceux', SK: 'METADATA' });
        });

        it('returns a 404 response when the feat does not exist', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'don-inconnu' } }));

            expect(result.statusCode).to.equal(404);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.include('don-inconnu');
        });

        it('returns a 500 response when DynamoDB fails', async () => {
            ddbMock.on(GetCommand).rejects(new Error('boom'));

            const result = await lambdaHandler(buildEvent({ pathParameters: { id: 'chanceux' } }));

            expect(result.statusCode).to.equal(500);

            const response = JSON.parse(result.body as string);
            expect(response.error).to.equal('Impossible de récupérer le don');
            expect(response.details).to.equal('boom');
        });
    });
});
