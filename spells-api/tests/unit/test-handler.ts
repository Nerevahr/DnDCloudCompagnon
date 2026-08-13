'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient } from '../../lib/dynamoClient';

const ddbMock = mockClient(docClient);

const rawSpells = [
    { PK: 'SPELL#boule-de-feu', SK: 'METADATA', name: 'Boule de feu', School: 'Évocation', Level: 3 },
    { PK: 'SPELL#lumiere', SK: 'METADATA', name: 'Lumière', School: 'Évocation', Level: 0 }
];

describe('Tests index', function () {
    beforeEach(() => {
        ddbMock.reset();
    });

    it('verifies successful response without filter', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: rawSpells.length, Items: rawSpells });

        const event = { queryStringParameters: null } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.a('string');

        const response = JSON.parse(result.body as string);

        expect(response).to.be.an('object');
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: 'none' });
        expect(response.count).to.equal(2);
        expect(response.spells).to.deep.equal([
            { name: 'Boule de feu', School: 'Évocation', Level: 3 },
            { name: 'Lumière', School: 'Évocation', Level: 0 }
        ]);
    });

    it('applies the school filter to the DynamoDB scan when provided', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 1, Items: [rawSpells[0]] });

        const event = { queryStringParameters: { school: 'Évocation' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Évocation'], level: 'none', class: 'none' });
        expect(response.count).to.equal(1);

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        expect(scanCalls[0].args[0].input.ExpressionAttributeValues?.[':school0']).to.equal('Évocation');
    });

    it('applies multiple school filters (comma-separated, as merged by API Gateway HTTP API) to the scan', async () => {
        ddbMock.on(ScanCommand).resolves({ Count: 2, Items: rawSpells });

        const event = { queryStringParameters: { school: 'Illusion,Conjuration' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Illusion', 'Conjuration'], level: 'none', class: 'none' });

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

        const event = { queryStringParameters: { level: '3' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: [3], class: 'none' });
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

        const event = { queryStringParameters: { school: 'Évocation', level: '0,3' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: ['Évocation'], level: [0, 3], class: 'none' });

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

        const event = { queryStringParameters: { class: 'Clerc' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: ['Clerc'] });
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

        const event = { queryStringParameters: { class: 'Clerc,Druide' } } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(200);

        const response = JSON.parse(result.body as string);
        expect(response.filterApplied).to.deep.equal({ school: 'none', level: 'none', class: ['Clerc', 'Druide'] });

        const scanCalls = ddbMock.commandCalls(ScanCommand);
        expect(scanCalls).to.have.lengthOf(1);
        const { input } = scanCalls[0].args[0];
        expect(input.ExpressionAttributeValues?.[':class0']).to.equal('Clerc');
        expect(input.ExpressionAttributeValues?.[':class1']).to.equal('Druide');
        expect(input.FilterExpression).to.include('(contains(#class, :class0) OR contains(#class, :class1))');
    });

    it('returns a 500 response when DynamoDB fails', async () => {
        ddbMock.on(ScanCommand).rejects(new Error('boom'));

        const event = { queryStringParameters: null } as unknown as APIGatewayProxyEventV2;
        const result = await lambdaHandler(event);

        expect(result.statusCode).to.equal(500);

        const response = JSON.parse(result.body as string);
        expect(response.error).to.equal('Impossible de récupérer les sorts');
        expect(response.details).to.equal('boom');
    });
});
