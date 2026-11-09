'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, BatchWriteCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { docClient, tableName } from '@dndcloud/core';

const ddbMock = mockClient(docClient);
const wsMock = mockClient(ApiGatewayManagementApiClient);

const USER = 'user-123';
const BASE = 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod';
const SELF_BASE = `${BASE}/api/v1/campaigns`;

function buildEvent(method: string, options: { id?: string; suffix?: string; body?: unknown; sub?: string | null; combatId?: string } = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
    const sub = options.sub === undefined ? USER : options.sub;
    const path = `/api/v1/campaigns${options.id ? `/${options.id}` : ''}${options.suffix ?? ''}`;
    return {
        headers: { 'x-forwarded-proto': 'https' },
        pathParameters: options.id ? { id: options.id, ...(options.combatId && { combatId: options.combatId }) } : undefined,
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
        wsMock.reset();
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
            ddbMock.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'CAMPAIGN#c1', ':prefix': 'COMBAT#' } }).resolves({ Items: [{ PK: 'CAMPAIGN#c1', SK: 'COMBAT#k1' }, { PK: 'CAMPAIGN#c1', SK: 'COMBAT#k2' }] });
            ddbMock.on(BatchWriteCommand).resolves({});

            const result = await lambdaHandler(buildEvent('DELETE', { id: 'c1' }));

            expect(result.statusCode).to.equal(204);
            const deleted = ddbMock.commandCalls(BatchWriteCommand).map((call) =>
                call.args[0].input.RequestItems![tableName].map((r) => `${r.DeleteRequest!.Key!.PK} ${r.DeleteRequest!.Key!.SK}`));
            expect(deleted).to.deep.equal([
                [`USER#${USER} CAMPAIGN#c1`, 'USER#p1 CAMPAIGN#c1', 'INVITE#code-abc INVITE'],
                [`CAMPAIGN#c1 MEMBER#${USER}`, 'CAMPAIGN#c1 MEMBER#p1'],
                ['CAMPAIGN#c1 COMBAT#k1', 'CAMPAIGN#c1 COMBAT#k2', 'CAMPAIGN#c1 METADATA']
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

    describe('combats', () => {
        const combatItem = (id: string, extra: Record<string, unknown> = {}) => ({
            PK: 'CAMPAIGN#c1', SK: `COMBAT#${id}`, Name: 'Embuscade', Status: 'PREPARING',
            Enemies: [{ id: 'e1', Name: 'Gobelin', Initiative: 12 }], Initiatives: {}, Bonuses: {},
            CreatedAt: '2026-01-03T00:00:00.000Z', UpdatedAt: '2026-01-03T00:00:00.000Z', ...extra
        });
        const COMBAT = combatItem('k1');
        const mockCombat = (item: Record<string, unknown> | undefined, id = 'k1') =>
            ddbMock.on(GetCommand, { Key: { PK: 'CAMPAIGN#c1', SK: `COMBAT#${id}` } }).resolves({ Item: item });
        const mockCombatList = (items: Record<string, unknown>[]) =>
            ddbMock.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'CAMPAIGN#c1', ':prefix': 'COMBAT#' } }).resolves({ Items: items });
        const NEW_BODY = { Name: ' Embuscade ', Enemies: [{ Name: 'Gobelin', Initiative: 12 }] };
        const call = (method: string, suffix: string, body?: unknown) => lambdaHandler(buildEvent(method, { id: 'c1', suffix, body, combatId: suffix.split('/')[2] }));

        it('lets the GM prepare several combats in advance', async () => {
            mockMembership('GM');
            ddbMock.on(PutCommand).resolves({});

            const first = await call('POST', '/combats', NEW_BODY);
            const second = await call('POST', '/combats', { Name: 'Boss', Enemies: [{ Name: 'Dragon', Initiative: 20 }] });

            expect(first.statusCode).to.equal(201);
            expect(parse(first).Combat).to.deep.include({ Name: 'Embuscade', Status: 'PREPARING' });
            const keys = ddbMock.commandCalls(PutCommand).map((c) => c.args[0].input.Item!.SK);
            expect(keys).to.have.length(2);
            expect(keys[0]).to.match(/^COMBAT#/);
            expect(keys[0]).to.not.equal(keys[1]);
            expect(second.statusCode).to.equal(201);
        });

        it('lists every combat for the GM', async () => {
            mockMembership('GM');
            mockCombatList([combatItem('k1'), combatItem('k2', { Name: 'Boss', CreatedAt: '2026-01-04T00:00:00.000Z' })]);

            const result = await call('GET', '/combats');

            expect(parse(result).Combats.map((c: { id: string }) => c.id)).to.deep.equal(['k1', 'k2']);
        });

        it('rejects invalid combats and non-GM callers', async () => {
            mockMembership('GM');
            const noEnemy = await call('POST', '/combats', { Name: 'x', Enemies: [] });
            const badInit = await call('POST', '/combats', { Name: 'x', Enemies: [{ Name: 'a', Initiative: 1.5 }] });
            mockMembership('PLAYER');
            const player = await call('POST', '/combats', NEW_BODY);

            expect(noEnemy.statusCode).to.equal(400);
            expect(badInit.statusCode).to.equal(400);
            expect(player.statusCode).to.equal(403);
        });

        it('edits a prepared combat but not a running one', async () => {
            mockMembership('GM');
            mockCombat(COMBAT);
            ddbMock.on(UpdateCommand).resolvesOnce({ Attributes: { ...COMBAT, Name: 'Embuscade' } });
            const ok = await call('PUT', '/combats/k1', NEW_BODY);
            ddbMock.on(UpdateCommand).rejects(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }));
            const running = await call('PUT', '/combats/k1', NEW_BODY);
            mockCombat(undefined, 'k9');
            const missing = await call('PUT', '/combats/k9', NEW_BODY);

            expect(ok.statusCode).to.equal(200);
            expect(parse(ok).Combat.id).to.equal('k1');
            expect(running.statusCode).to.equal(409);
            expect(missing.statusCode).to.equal(404);
        });

        it('starts a combat for the GM only, one at a time', async () => {
            mockMembership('GM');
            mockCombatList([COMBAT]);
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'INITIATIVE' } });
            const started = await call('POST', '/combats/k1/start');
            mockCombatList([COMBAT, combatItem('k2', { Status: 'INITIATIVE' })]);
            const busy = await call('POST', '/combats/k1/start');
            mockMembership('PLAYER');
            const forbidden = await call('POST', '/combats/k1/start');

            expect(started.statusCode).to.equal(200);
            expect(parse(started).Combat.Status).to.equal('INITIATIVE');
            expect(busy.statusCode).to.equal(409);
            expect(forbidden.statusCode).to.equal(403);
        });

        it('notifies the connected members when a combat is launched', async () => {
            process.env.WEBSOCKET_ENDPOINT = 'https://ws.example.com/prod';
            try {
                mockMembership('GM');
                mockCombatList([COMBAT]);
                ddbMock.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'CAMPAIGN#c1', ':prefix': 'CONN#' } })
                    .resolves({ Items: [{ PK: 'CAMPAIGN#c1', SK: 'CONN#a', UserId: 'p1', Role: 'PLAYER' }, { PK: 'CAMPAIGN#c1', SK: 'CONN#b', UserId: 'p2', Role: 'PLAYER' }] });
                ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'INITIATIVE' } });
                wsMock.on(PostToConnectionCommand).resolves({});

                const result = await call('POST', '/combats/k1/start');

                expect(result.statusCode).to.equal(200);
                const sent = wsMock.commandCalls(PostToConnectionCommand).map((c) => [c.args[0].input.ConnectionId, Buffer.from(c.args[0].input.Data as Uint8Array).toString()]);
                expect(sent).to.deep.equal([['a', '{"type":"combat"}'], ['b', '{"type":"combat"}']]);
            } finally {
                delete process.env.WEBSOCKET_ENDPOINT;
            }
        });

        it('still succeeds when the notification fails', async () => {
            process.env.WEBSOCKET_ENDPOINT = 'https://ws.example.com/prod';
            try {
                mockMembership('GM');
                mockCombatList([COMBAT]);
                ddbMock.on(QueryCommand, { ExpressionAttributeValues: { ':pk': 'CAMPAIGN#c1', ':prefix': 'CONN#' } }).rejects(new Error('boom'));
                ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'INITIATIVE' } });

                expect((await call('POST', '/combats/k1/start')).statusCode).to.equal(200);
            } finally {
                delete process.env.WEBSOCKET_ENDPOINT;
            }
        });

        it('deletes a combat', async () => {
            mockMembership('GM');
            ddbMock.on(DeleteCommand).resolves({});

            const result = await call('DELETE', '/combats/k1');

            expect(result.statusCode).to.equal(204);
            expect(ddbMock.commandCalls(DeleteCommand)[0].args[0].input.Key).to.deep.equal({ PK: 'CAMPAIGN#c1', SK: 'COMBAT#k1' });
        });

        it('shows nothing to players while combats are only prepared', async () => {
            mockMembership('PLAYER', 'char-1');
            mockCombatList([COMBAT]);

            const result = await call('GET', '/combats');

            expect(parse(result)).to.deep.equal({ Combats: [] });
        });

        it('shows only the running combat to players, without the enemies, with their initiative bonus', async () => {
            mockMembership('PLAYER', 'char-1');
            mockCombatList([COMBAT, combatItem('k2', { Status: 'INITIATIVE', Initiatives: { [USER]: 17 } })]);
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#char-1' } }).resolves({ Item: { Abilities: { Dexterity: 14 } } });

            const { Combats } = parse(await call('GET', '/combats'));

            expect(Combats).to.have.length(1);
            expect(Combats[0]).to.deep.include({ id: 'k2', Name: 'Embuscade', Status: 'INITIATIVE', Initiative: 17, InitiativeBonus: 2 });
            expect(Combats[0]).to.not.have.property('Enemies');
        });

        it('records a player initiative', async () => {
            mockMembership('PLAYER', 'char-1');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#char-1' } }).resolves({ Item: {} });
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'INITIATIVE', Initiatives: { [USER]: 15 } } });

            const result = await call('PUT', '/combats/k1/initiative', { Initiative: 15 });
            const bad = await call('PUT', '/combats/k1/initiative', { Initiative: 'x' });

            expect(result.statusCode).to.equal(200);
            expect(parse(result).Combat.Initiative).to.equal(15);
            expect(bad.statusCode).to.equal(400);
        });

        it('publishes the play order once every player has rolled, breaking ties with the bonus', async () => {
            mockMembership('PLAYER', 'char-1');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#char-1' } }).resolves({ Item: { Abilities: { Dexterity: 14 } } });
            const rolled = { ...COMBAT, Status: 'INITIATIVE', Initiatives: { [USER]: 12 }, Bonuses: { [USER]: 2 } };
            ddbMock.on(UpdateCommand).resolvesOnce({ Attributes: rolled }).resolvesOnce({ Attributes: { ...rolled, Status: 'ORDER' } });

            const result = await call('PUT', '/combats/k1/initiative', { Initiative: 12 });

            const published = ddbMock.commandCalls(UpdateCommand)[1].args[0].input.ExpressionAttributeValues![':entries'];
            // Même initiative (12) que le gobelin : le joueur (bonus +2) passe devant
            expect(published.map((e: { Name: string }) => e.Name)).to.deep.equal(['Aria', 'Gobelin']);
            expect(result.statusCode).to.equal(200);
        });

        it('keeps waiting while a player has not rolled', async () => {
            mockMembership('PLAYER', 'char-1');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#char-1' } }).resolves({ Item: {} });
            ddbMock.on(QueryCommand).resolves({ Items: [memberItem(USER, 'PLAYER', 'char-1'), memberItem('p2', 'PLAYER', 'char-2')] });
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'INITIATIVE', Initiatives: { [USER]: 12 }, Bonuses: { [USER]: 0 } } });

            await call('PUT', '/combats/k1/initiative', { Initiative: 12 });

            expect(ddbMock.commandCalls(UpdateCommand)).to.have.length(1);
        });

        it('hides the play order from players until the GM begins the combat', async () => {
            const order = [{ id: 'a', Name: 'A', Initiative: 5, Bonus: 0, Enemy: false }];
            mockMembership('PLAYER', 'char-1');
            ddbMock.on(GetCommand, { Key: { PK: `USER#${USER}`, SK: 'CHARACTER#char-1' } }).resolves({ Item: {} });
            mockCombatList([combatItem('k1', { Status: 'ORDER', Initiatives: { [USER]: 12 }, Order: order })]);
            const waiting = parse(await call('GET', '/combats')).Combats[0];
            mockCombatList([combatItem('k1', { Status: 'RUNNING', Initiatives: { [USER]: 12 }, Order: order })]);
            const running = parse(await call('GET', '/combats')).Combats[0];

            expect(waiting).to.deep.include({ Status: 'ORDER', Initiative: 12 });
            expect(waiting).to.not.have.property('Order');
            // Seul l'ordre est transmis : ni initiatives ni bonus
            expect(running.Order).to.deep.equal([{ id: 'a', Name: 'A', Enemy: false }]);
            expect(JSON.stringify(running.Order)).to.not.match(/Initiative|Bonus/);
        });

        it('lets the GM begin a combat once the order is ready', async () => {
            mockMembership('GM');
            mockCombat({ ...COMBAT, Status: 'ORDER' });
            ddbMock.on(UpdateCommand).resolvesOnce({ Attributes: { ...COMBAT, Status: 'RUNNING' } });
            const ok = await call('POST', '/combats/k1/begin');
            ddbMock.on(UpdateCommand).rejects(Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }));
            const early = await call('POST', '/combats/k1/begin');
            mockMembership('PLAYER');
            const forbidden = await call('POST', '/combats/k1/begin');

            expect(ok.statusCode).to.equal(200);
            expect(parse(ok).Combat.Status).to.equal('RUNNING');
            expect(early.statusCode).to.equal(409);
            expect(forbidden.statusCode).to.equal(403);
        });

        it('lets the GM add enemies to a running combat when saving the order', async () => {
            const order = [{ id: 'a', Name: 'A', Initiative: 5, Bonus: 0, Enemy: false }, { id: 'b', Name: 'B', Initiative: 4, Bonus: 0, Enemy: true }];
            mockMembership('GM');
            mockCombat({ ...COMBAT, Status: 'RUNNING', Enemies: [{ id: 'b', Name: 'B', Initiative: 4 }], Order: order });
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'RUNNING' } });

            const ok = await call('PUT', '/combats/k1/order', { Order: ['a', 'new-1', 'b'], NewEnemies: [{ id: 'new-1', Name: ' Renfort ', Initiative: 9 }] });
            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            const entries = input.ExpressionAttributeValues![':entries'];
            const enemies = input.ExpressionAttributeValues![':enemies'];
            const clash = await call('PUT', '/combats/k1/order', { Order: ['a', 'b'], NewEnemies: [{ id: 'a', Name: 'x', Initiative: 9 }] });

            expect(ok.statusCode).to.equal(200);
            expect(entries.map((e: { Name: string }) => e.Name)).to.deep.equal(['A', 'Renfort', 'B']);
            expect(entries[1]).to.include({ Initiative: 9, Bonus: 0, Enemy: true });
            expect(entries[1].id).to.not.equal('new-1');
            expect(enemies.map((e: { Name: string }) => e.Name)).to.deep.equal(['B', 'Renfort']);
            expect(clash.statusCode).to.equal(400);
        });

        it('lets the GM remove enemies but never players when saving the order', async () => {
            const order = [{ id: 'a', Name: 'A', Initiative: 5, Bonus: 0, Enemy: false }, { id: 'e1', Name: 'Gobelin', Initiative: 4, Bonus: 0, Enemy: true }];
            mockMembership('GM');
            mockCombat({ ...COMBAT, Status: 'RUNNING', Order: order });
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'RUNNING' } });

            const ok = await call('PUT', '/combats/k1/order', { Order: ['a'] });
            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            const player = await call('PUT', '/combats/k1/order', { Order: ['e1'] });

            expect(ok.statusCode).to.equal(200);
            expect(input.ExpressionAttributeValues![':entries'].map((e: { id: string }) => e.id)).to.deep.equal(['a']);
            expect(input.ExpressionAttributeValues![':enemies']).to.deep.equal([]);
            expect(player.statusCode).to.equal(400);
            expect(ddbMock.commandCalls(UpdateCommand)).to.have.length(1);
        });

        it('lets the GM reorder the play order with the same participants only', async () => {
            const order = [{ id: 'a', Name: 'A', Initiative: 5, Bonus: 0, Enemy: false }, { id: 'b', Name: 'B', Initiative: 4, Bonus: 0, Enemy: true }];
            mockMembership('GM');
            mockCombat({ ...COMBAT, Status: 'ORDER', Order: order });
            ddbMock.on(UpdateCommand).resolves({ Attributes: { ...COMBAT, Status: 'ORDER', Order: [order[1], order[0]] } });

            const ok = await call('PUT', '/combats/k1/order', { Order: ['b', 'a'] });
            const missing = await call('PUT', '/combats/k1/order', { Order: ['b'] });
            const unknown = await call('PUT', '/combats/k1/order', { Order: ['b', 'z'] });

            expect(ok.statusCode).to.equal(200);
            expect(parse(ok).Combat.Order.map((e: { id: string }) => e.id)).to.deep.equal(['b', 'a']);
            expect(missing.statusCode).to.equal(400);
            expect(unknown.statusCode).to.equal(400);
        });
    });
});
