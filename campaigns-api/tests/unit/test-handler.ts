'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, BatchWriteCommand, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient, tableName } from '@dndcloud/core';

const ddbMock = mockClient(docClient);

const USER = 'user-123';
const BASE = 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod';
const SELF_BASE = `${BASE}/api/v1/campaigns`;

function buildEvent(method: string, options: { id?: string; suffix?: string; body?: unknown; sub?: string | null } = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
    const sub = options.sub === undefined ? USER : options.sub;
    const path = `/api/v1/campaigns${options.id ? `/${options.id}` : ''}${options.suffix ?? ''}`;
    return {
        headers: { 'x-forwarded-proto': 'https' },
        pathParameters: options.id ? { id: options.id } : undefined,
        body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
        requestContext: {
            domainName: '1234567890.execute-api.eu-west-3.amazonaws.com',
            stage: 'prod',
            http: { method, path: `/prod${path}` },
            authorizer: sub === null ? undefined : { jwt: { claims: { sub }, scopes: [] } }
        }
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const parse = (result: { body?: string }) => JSON.parse(result.body as string);

const CAMPAIGN = {
    PK: 'CAMPAIGN#c1', SK: 'METADATA', Name: 'Phandelver', Description: 'Niveau 1',
    GameMasterId: 'gm-1', InviteCode: 'code-abc', CreatedAt: '2026-01-01T00:00:00.000Z', UpdatedAt: '2026-01-01T00:00:00.000Z'
};
const memberItem = (userId: string, Role: string, CharacterId?: string) =>
    ({ PK: 'CAMPAIGN#c1', SK: `MEMBER#${userId}`, Role, JoinedAt: '2026-01-02T00:00:00.000Z', ...(CharacterId && { CharacterId }) });

// Simule une campagne c1 dont `me` est membre avec le rôle donné (GetCommand sur MEMBER# et METADATA)
const mockMembership = (role: string | null, characterId?: string) => {
    ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}` } }).resolves({ Item: role ? memberItem(USER, role, characterId) : undefined });
    ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: 'METADATA' } }).resolves({ Item: CAMPAIGN });
    ddbMock.on(QueryCommand).resolves({ Items: [memberItem('gm-1', 'GM'), ...(role === 'PLAYER' ? [memberItem(USER, 'PLAYER', characterId)] : [])] });
    ddbMock.on(BatchGetCommand).resolves({ Responses: { [tableName]: characterId ? [{ PK: `USER#${USER}`, SK: `CHARACTER#${characterId}`, Name: 'Aria', Class: 'Magicien', Species: 'Elfe', Level: 3 }] : [] } });
};

describe('Campaigns API', function () {
    beforeEach(() => {
        ddbMock.reset();
    });

    it('rejects requests without an authenticated user', async () => {
        const result = await lambdaHandler(buildEvent('GET', { sub: null }));

        expect(result.statusCode).to.equal(401);
        expect(ddbMock.calls()).to.have.length(0);
    });

    describe('local development (sam local)', () => {
        const asLocal = async (authorization: string | undefined) => {
            process.env.AWS_SAM_LOCAL = 'true';
            try {
                ddbMock.on(QueryCommand).resolves({ Items: [] });
                const event = buildEvent('GET', { sub: null });
                event.headers = authorization ? { Authorization: authorization } : {};
                await lambdaHandler(event);
                return ddbMock.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues![':pk'];
            } finally {
                delete process.env.AWS_SAM_LOCAL;
            }
        };
        const token = (sub: string) => `Bearer h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;

        it('tells users apart through the sub of their token', async () => {
            expect(await asLocal(token('alice'))).to.equal('USER#alice');
            ddbMock.reset();
            expect(await asLocal(token('bob'))).to.equal('USER#bob');
        });

        it('falls back to a fake user without a usable token', async () => {
            expect(await asLocal(undefined)).to.equal('USER#local-user');
            ddbMock.reset();
            expect(await asLocal('Bearer garbage')).to.equal('USER#local-user');
        });
    });

    describe('POST /campaigns', () => {
        it('creates the campaign with the caller as game master and an invite code', async () => {
            ddbMock.on(TransactWriteCommand).resolves({});
            ddbMock.on(QueryCommand).resolves({ Items: [memberItem(USER, 'GM')] });
            ddbMock.on(BatchGetCommand).resolves({ Responses: {} });

            const result = await lambdaHandler(buildEvent('POST', { body: { Name: ' Phandelver ' } }));
            const body = parse(result);

            expect(result.statusCode).to.equal(201);
            expect(result.headers?.Location).to.equal(body._self);
            expect(body).to.include({ Name: 'Phandelver', Description: '', GameMasterId: USER, Role: 'GM', NeedsCharacter: false });
            expect(body.Members).to.deep.equal([{ UserId: USER, IsMe: true, Role: 'GM', JoinedAt: '2026-01-02T00:00:00.000Z' }]);
            expect(body.InviteCode).to.be.a('string').with.length.greaterThan(20);

            const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!.map((i) => i.Put!.Item!);
            expect(items.map((i) => `${i.PK} ${i.SK}`)).to.deep.equal([
                `CAMPAIGN#${body.id} METADATA`,
                `CAMPAIGN#${body.id} MEMBER#${USER}`,
                `USER#${USER} CAMPAIGN#${body.id}`,
                `INVITE#${body.InviteCode} INVITE`
            ]);
            expect(items[1].Role).to.equal('GM');
            expect(items[3].CampaignId).to.equal(body.id);
        });

        it('rejects an invalid body', async () => {
            const missing = await lambdaHandler(buildEvent('POST', { body: { Description: 'x' } }));
            const unknown = await lambdaHandler(buildEvent('POST', { body: { Name: 'x', GameMasterId: 'me' } }));
            const empty = await lambdaHandler(buildEvent('POST', { body: { Name: '  ' } }));

            expect(missing.statusCode).to.equal(400);
            expect(unknown.statusCode).to.equal(400);
            expect(empty.statusCode).to.equal(400);
            expect(ddbMock.calls()).to.have.length(0);
        });
    });

    describe('GET /campaigns', () => {
        it('lists the campaigns of the caller with his role', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [{ PK: `USER#${USER}`, SK: 'CAMPAIGN#c1', Role: 'PLAYER' }] });
            ddbMock.on(BatchGetCommand).resolves({ Responses: { [tableName]: [CAMPAIGN] } });

            const result = await lambdaHandler(buildEvent('GET'));

            expect(result.statusCode).to.equal(200);
            expect(parse(result)).to.deep.equal({
                count: 1,
                campaigns: [{ id: 'c1', Name: 'Phandelver', Description: 'Niveau 1', GameMasterId: 'gm-1', UpdatedAt: CAMPAIGN.UpdatedAt, Role: 'PLAYER', _self: `${SELF_BASE}/c1` }]
            });
            expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues).to.include({ ':pk': `USER#${USER}` });
        });

        it('does not query anything for a user without campaign', async () => {
            ddbMock.on(QueryCommand).resolves({ Items: [] });

            const result = await lambdaHandler(buildEvent('GET'));

            expect(parse(result)).to.deep.equal({ count: 0, campaigns: [] });
            expect(ddbMock.commandCalls(BatchGetCommand)).to.have.length(0);
        });
    });

    describe('GET /campaigns/{id}', () => {
        it('returns the campaign, members and invite code to the game master', async () => {
            mockMembership('GM');

            const result = await lambdaHandler(buildEvent('GET', { id: 'c1' }));
            const body = parse(result);

            expect(result.statusCode).to.equal(200);
            expect(body).to.include({ id: 'c1', Role: 'GM', NeedsCharacter: false, InviteCode: 'code-abc', _self: `${SELF_BASE}/c1` });
        });

        it('asks a player without character to choose one, and hides the invite code', async () => {
            mockMembership('PLAYER');

            const body = parse(await lambdaHandler(buildEvent('GET', { id: 'c1' })));

            expect(body.Role).to.equal('PLAYER');
            expect(body.NeedsCharacter).to.equal(true);
            expect(body).to.not.have.property('InviteCode');
        });

        it('shows the chosen characters of the members', async () => {
            mockMembership('PLAYER', 'ch1');

            const body = parse(await lambdaHandler(buildEvent('GET', { id: 'c1' })));

            expect(body.NeedsCharacter).to.equal(false);
            expect(body.Members.find((m: { UserId: string }) => m.UserId === USER)).to.deep.include({
                CharacterId: 'ch1',
                Character: { id: 'ch1', Name: 'Aria', Class: 'Magicien', Species: 'Elfe', Level: 3 }
            });
        });

        it('answers 404 to a user who is not a member', async () => {
            mockMembership(null);

            const result = await lambdaHandler(buildEvent('GET', { id: 'c1' }));

            expect(result.statusCode).to.equal(404);
        });
    });

    describe('PATCH /campaigns/{id}', () => {
        it('lets the game master rename the campaign', async () => {
            mockMembership('GM');
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...CAMPAIGN, Name: 'Nouveau nom' } });

            const result = await lambdaHandler(buildEvent('PATCH', { id: 'c1', body: { Name: 'Nouveau nom' } }));

            expect(result.statusCode).to.equal(200);
            expect(parse(result).Name).to.equal('Nouveau nom');
            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            expect(input.Key).to.deep.equal({ PK: 'CAMPAIGN#c1', SK: 'METADATA' });
            expect(input.ExpressionAttributeValues).to.include({ ':Name': 'Nouveau nom' });
        });

        it('forbids a player', async () => {
            mockMembership('PLAYER');

            const result = await lambdaHandler(buildEvent('PATCH', { id: 'c1', body: { Name: 'Piraté' } }));

            expect(result.statusCode).to.equal(403);
            expect(ddbMock.commandCalls(UpdateCommand)).to.have.length(0);
        });

        it('rejects empty and unknown changes', async () => {
            expect((await lambdaHandler(buildEvent('PATCH', { id: 'c1', body: {} }))).statusCode).to.equal(400);
            expect((await lambdaHandler(buildEvent('PATCH', { id: 'c1', body: { InviteCode: 'x' } }))).statusCode).to.equal(400);
        });
    });

    describe('DELETE /campaigns/{id}', () => {
        it('deletes everything, the metadata last', async () => {
            mockMembership('GM');
            ddbMock.on(QueryCommand).resolves({ Items: [memberItem(USER, 'GM'), memberItem('p1', 'PLAYER')] });
            ddbMock.on(BatchWriteCommand).resolves({});

            const result = await lambdaHandler(buildEvent('DELETE', { id: 'c1' }));

            expect(result.statusCode).to.equal(204);
            const deleted = ddbMock.commandCalls(BatchWriteCommand).map((call) =>
                call.args[0].input.RequestItems![tableName].map((r) => `${r.DeleteRequest!.Key!.PK} ${r.DeleteRequest!.Key!.SK}`));
            expect(deleted).to.deep.equal([
                [`USER#${USER} CAMPAIGN#c1`, 'USER#p1 CAMPAIGN#c1', 'INVITE#code-abc INVITE'],
                [`CAMPAIGN#c1 MEMBER#${USER}`, 'CAMPAIGN#c1 MEMBER#p1'],
                ['CAMPAIGN#c1 METADATA']
            ]);
        });

        it('forbids a player and hides the campaign from outsiders', async () => {
            mockMembership('PLAYER');
            expect((await lambdaHandler(buildEvent('DELETE', { id: 'c1' }))).statusCode).to.equal(403);

            ddbMock.reset();
            mockMembership(null);
            expect((await lambdaHandler(buildEvent('DELETE', { id: 'c1' }))).statusCode).to.equal(404);
            expect(ddbMock.commandCalls(BatchWriteCommand)).to.have.length(0);
        });
    });

    describe('POST /campaigns/join', () => {
        const inviteLookup = () => ddbMock.on(GetCommand, { Key: { PK: 'INVITE#code-abc', SK: 'INVITE' } }).resolves({ Item: { CampaignId: 'c1' } });

        it('adds the caller as a player without character yet', async () => {
            inviteLookup();
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}` } })
                .resolvesOnce({ Item: undefined })
                .resolves({ Item: memberItem(USER, 'PLAYER') });
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: 'METADATA' } }).resolves({ Item: CAMPAIGN });
            ddbMock.on(TransactWriteCommand).resolves({});
            ddbMock.on(QueryCommand).resolves({ Items: [memberItem('gm-1', 'GM'), memberItem(USER, 'PLAYER')] });
            ddbMock.on(BatchGetCommand).resolves({ Responses: {} });

            const result = await lambdaHandler(buildEvent('POST', { suffix: '/join', body: { InviteCode: 'code-abc' } }));
            const body = parse(result);

            expect(result.statusCode).to.equal(201);
            expect(body).to.include({ id: 'c1', Role: 'PLAYER', NeedsCharacter: true });
            const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
            expect(items[0].Put!.Item).to.include({ PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}`, Role: 'PLAYER' });
            expect(items[0].Put!.Item).to.not.have.property('CharacterId');
            expect(items[1].Put!.Item).to.include({ PK: `USER#${USER}`, SK: 'CAMPAIGN#c1', Role: 'PLAYER' });
        });

        it('accepts the character right away if it belongs to the caller', async () => {
            inviteLookup();
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}` } })
                .resolvesOnce({ Item: undefined })
                .resolves({ Item: memberItem(USER, 'PLAYER', 'ch1') });
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: 'METADATA' } }).resolves({ Item: CAMPAIGN });
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#ch1' } }).resolves({ Item: { SK: 'CHARACTER#ch1' } });
            ddbMock.on(TransactWriteCommand).resolves({});
            ddbMock.on(QueryCommand).resolves({ Items: [memberItem(USER, 'PLAYER', 'ch1')] });
            ddbMock.on(BatchGetCommand).resolves({ Responses: {} });

            const result = await lambdaHandler(buildEvent('POST', { suffix: '/join', body: { InviteCode: 'code-abc', CharacterId: 'ch1' } }));

            expect(result.statusCode).to.equal(201);
            expect(parse(result).NeedsCharacter).to.equal(false);
            expect(ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item).to.include({ CharacterId: 'ch1' });
        });

        it("refuses someone else's character", async () => {
            inviteLookup();
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}` } }).resolves({ Item: undefined });
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#other' } }).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent('POST', { suffix: '/join', body: { InviteCode: 'code-abc', CharacterId: 'other' } }));

            expect(result.statusCode).to.equal(400);
            expect(ddbMock.commandCalls(TransactWriteCommand)).to.have.length(0);
        });

        it('is idempotent for an existing member', async () => {
            inviteLookup();
            mockMembership('PLAYER', 'ch1');

            const result = await lambdaHandler(buildEvent('POST', { suffix: '/join', body: { InviteCode: 'code-abc' } }));

            expect(result.statusCode).to.equal(200);
            expect(ddbMock.commandCalls(TransactWriteCommand)).to.have.length(0);
        });

        it('answers 404 to an unknown or expired code', async () => {
            ddbMock.on(GetCommand).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent('POST', { suffix: '/join', body: { InviteCode: 'nope' } }));

            expect(result.statusCode).to.equal(404);
        });

        it('requires an invite code', async () => {
            expect((await lambdaHandler(buildEvent('POST', { suffix: '/join', body: {} }))).statusCode).to.equal(400);
        });
    });

    describe('PUT /campaigns/{id}/character', () => {
        it('lets a player pick one of his own characters', async () => {
            mockMembership('PLAYER');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#ch1' } }).resolves({ Item: { SK: 'CHARACTER#ch1' } });
            ddbMock.on(UpdateCommand).resolves({});

            const result = await lambdaHandler(buildEvent('PUT', { id: 'c1', suffix: '/character', body: { CharacterId: 'ch1' } }));

            expect(result.statusCode).to.equal(200);
            expect(parse(result).NeedsCharacter).to.equal(false);
            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            expect(input.Key).to.deep.equal({ PK: 'CAMPAIGN#c1', SK: `MEMBER#${USER}` });
            expect(input.ExpressionAttributeValues).to.deep.equal({ ':characterId': 'ch1' });
        });

        it("refuses a character that is not the caller's", async () => {
            mockMembership('PLAYER');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#other' } }).resolves({ Item: undefined });

            const result = await lambdaHandler(buildEvent('PUT', { id: 'c1', suffix: '/character', body: { CharacterId: 'other' } }));

            expect(result.statusCode).to.equal(400);
            expect(ddbMock.commandCalls(UpdateCommand)).to.have.length(0);
        });

        it('forbids the game master and outsiders', async () => {
            mockMembership('GM');
            expect((await lambdaHandler(buildEvent('PUT', { id: 'c1', suffix: '/character', body: { CharacterId: 'ch1' } }))).statusCode).to.equal(403);

            ddbMock.reset();
            mockMembership(null);
            expect((await lambdaHandler(buildEvent('PUT', { id: 'c1', suffix: '/character', body: { CharacterId: 'ch1' } }))).statusCode).to.equal(404);
        });
    });

    describe('POST /campaigns/{id}/invite', () => {
        it('replaces the invite code for the game master', async () => {
            mockMembership('GM');
            ddbMock.on(TransactWriteCommand).resolves({});

            const result = await lambdaHandler(buildEvent('POST', { id: 'c1', suffix: '/invite' }));
            const body = parse(result);

            expect(result.statusCode).to.equal(200);
            expect(body.InviteCode).to.not.equal('code-abc');
            const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
            expect(items[0].Delete!.Key).to.deep.equal({ PK: 'INVITE#code-abc', SK: 'INVITE' });
            expect(items[1].Put!.Item).to.include({ PK: `INVITE#${body.InviteCode}`, CampaignId: 'c1' });
        });

        it('forbids a player', async () => {
            mockMembership('PLAYER');

            expect((await lambdaHandler(buildEvent('POST', { id: 'c1', suffix: '/invite' }))).statusCode).to.equal(403);
        });
    });

    it('answers 405 to an unsupported method', async () => {
        expect((await lambdaHandler(buildEvent('PUT', { id: 'c1' }))).statusCode).to.equal(405);
    });
});
