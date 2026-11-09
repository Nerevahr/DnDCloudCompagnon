'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { DeleteCommand, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { expect } from 'chai';
import { lambdaHandler } from '../../app';
import { auth } from '../../lib/auth';
import { docClient } from '@dndcloud/core';

const ddbMock = mockClient(docClient);
const wsMock = mockClient(ApiGatewayManagementApiClient);

const event = (routeKey: string, options: { connectionId?: string; query?: Record<string, string>; body?: unknown } = {}) => ({
    requestContext: { routeKey, connectionId: options.connectionId ?? 'conn-new' },
    queryStringParameters: options.query,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
}) as unknown as Parameters<typeof lambdaHandler>[0];

const connItem = (connectionId: string, UserId: string, Role: string) => ({ PK: 'CAMPAIGN#c1', SK: `CONN#${connectionId}`, UserId, Role });
const posted = () => wsMock.commandCalls(PostToConnectionCommand).map((call) => ({
    to: call.args[0].input.ConnectionId, data: JSON.parse(Buffer.from(call.args[0].input.Data as Uint8Array).toString())
}));

describe('Realtime API', function () {
    const verify = auth.verify;

    beforeEach(() => {
        ddbMock.reset();
        wsMock.reset();
        process.env.WEBSOCKET_ENDPOINT = 'https://ws.example.com/prod';
        auth.verify = async (token) => (token === 'good' ? 'user-1' : undefined);
    });
    afterEach(() => {
        auth.verify = verify;
        delete process.env.WEBSOCKET_ENDPOINT;
    });

    describe('$connect', () => {
        it('rejects a connection without campaign or token', async () => {
            expect((await lambdaHandler(event('$connect', { query: { campaignId: 'c1' } }))) as { statusCode: number }).to.have.property('statusCode', 400);
        });

        it('rejects an invalid token', async () => {
            const result = await lambdaHandler(event('$connect', { query: { campaignId: 'c1', token: 'bad' } }));

            expect(result).to.have.property('statusCode', 401);
            expect(ddbMock.calls()).to.have.length(0);
        });

        it('rejects a user who is not a member of the campaign', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(event('$connect', { query: { campaignId: 'c1', token: 'good' } }));

            expect(result).to.have.property('statusCode', 403);
            expect(ddbMock.commandCalls(TransactWriteCommand)).to.have.length(0);
        });

        it('registers the connection and tells the other members who is present', async () => {
            ddbMock.on(GetCommand).resolves({ Item: { Role: 'PLAYER' } });
            ddbMock.on(TransactWriteCommand).resolves({});
            ddbMock.on(QueryCommand).resolves({ Items: [connItem('conn-gm', 'gm-1', 'GM'), connItem('conn-new', 'user-1', 'PLAYER'), connItem('conn-2', 'user-1', 'PLAYER')] });
            wsMock.on(PostToConnectionCommand).resolves({});

            const result = await lambdaHandler(event('$connect', { query: { campaignId: 'c1', token: 'good' } }));

            expect(result).to.have.property('statusCode', 200);
            const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!.map((i) => i.Put!.Item!);
            expect(items.map((i) => `${i.PK} ${i.SK}`)).to.deep.equal(['CAMPAIGN#c1 CONN#conn-new', 'CONN#conn-new CONN']);
            expect(items[0]).to.include({ UserId: 'user-1', Role: 'PLAYER' });
            expect(items[0].ExpiresAt).to.be.a('number');
            // Le nouvel arrivant est compté (une seule fois malgré deux onglets) mais ne reçoit pas le message
            expect(posted()).to.deep.equal([
                { to: 'conn-gm', data: { type: 'presence', Present: ['user-1'] } },
                { to: 'conn-2', data: { type: 'presence', Present: ['user-1'] } }
            ]);
        });
    });

    describe('$disconnect', () => {
        it('removes the connection and updates the presence of the others', async () => {
            ddbMock.on(GetCommand).resolves({ Item: { CampaignId: 'c1' } });
            ddbMock.on(DeleteCommand).resolves({});
            ddbMock.on(QueryCommand).resolves({ Items: [connItem('conn-gm', 'gm-1', 'GM')] });
            wsMock.on(PostToConnectionCommand).resolves({});

            const result = await lambdaHandler(event('$disconnect', { connectionId: 'conn-1' }));

            expect(result).to.have.property('statusCode', 200);
            expect(ddbMock.commandCalls(DeleteCommand).map((c) => `${c.args[0].input.Key!.PK} ${c.args[0].input.Key!.SK}`))
                .to.have.members(['CAMPAIGN#c1 CONN#conn-1', 'CONN#conn-1 CONN']);
            expect(posted()).to.deep.equal([{ to: 'conn-gm', data: { type: 'presence', Present: [] } }]);
        });

        it('ignores an unknown connection', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(event('$disconnect'));

            expect(result).to.have.property('statusCode', 200);
            expect(ddbMock.commandCalls(DeleteCommand)).to.have.length(0);
        });
    });

    describe('messages', () => {
        it('answers a presence request to the caller only', async () => {
            ddbMock.on(GetCommand).resolves({ Item: { CampaignId: 'c1' } });
            ddbMock.on(QueryCommand).resolves({ Items: [connItem('conn-1', 'user-1', 'PLAYER')] });
            wsMock.on(PostToConnectionCommand).resolves({});

            await lambdaHandler(event('$default', { connectionId: 'conn-1', body: { action: 'presence' } }));

            expect(posted()).to.deep.equal([{ to: 'conn-1', data: { type: 'presence', Present: ['user-1'] } }]);
        });

        it('accepts pings and garbage silently', async () => {
            const ping = await lambdaHandler(event('$default', { body: { action: 'ping' } }));
            const garbage = await lambdaHandler({ ...event('$default'), body: '{nope' } as Parameters<typeof lambdaHandler>[0]);

            expect(ping).to.have.property('statusCode', 200);
            expect(garbage).to.have.property('statusCode', 200);
            expect(posted()).to.have.length(0);
        });
    });
});
