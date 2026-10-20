'use strict';

import { mockClient } from 'aws-sdk-client-mock';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { expect } from 'chai';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { lambdaHandler } from '../../app';
import { docClient } from '@dndcloud/core';

const ddbMock = mockClient(docClient);

const OWNER = 'user-123';
const SELF_BASE = 'https://1234567890.execute-api.eu-west-3.amazonaws.com/prod/api/v1/characters';

function buildEvent(method: string, options: { id?: string; body?: unknown; sub?: string | null } = {}): APIGatewayProxyEventV2WithJWTAuthorizer {
    const sub = options.sub === undefined ? OWNER : options.sub;
    return {
        headers: { 'x-forwarded-proto': 'https' },
        pathParameters: options.id ? { id: options.id } : undefined,
        body: options.body === undefined ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
        requestContext: {
            domainName: '1234567890.execute-api.eu-west-3.amazonaws.com',
            stage: 'prod',
            http: { method },
            authorizer: sub === null ? undefined : { jwt: { claims: { sub }, scopes: [] } }
        }
    } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const parse = (result: { body?: string }) => JSON.parse(result.body as string);

const conditionalCheckFailed = () => Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' });

describe('Characters API', function () {
    beforeEach(() => {
        ddbMock.reset();
    });

    it('rejects requests without an authenticated user', async () => {
        const result = await lambdaHandler(buildEvent('GET', { sub: null }));

        expect(result.statusCode).to.equal(401);
        expect(ddbMock.calls()).to.have.length(0);
    });

    describe('GET /characters', () => {
        it('lists only the characters of the authenticated user', async () => {
            ddbMock.on(QueryCommand).resolves({
                Items: [
                    { SK: 'CHARACTER#abc', Name: 'Aria', Class: 'Magicien', Species: 'Elfe', Level: 3, HitPoints: { Current: 10, Max: 18, Temporary: 0 } }
                ]
            });

            const result = await lambdaHandler(buildEvent('GET'));

            expect(result.statusCode).to.equal(200);
            expect(parse(result)).to.deep.equal({
                count: 1,
                characters: [
                    {
                        id: 'abc',
                        Name: 'Aria',
                        Class: 'Magicien',
                        Species: 'Elfe',
                        Level: 3,
                        HitPoints: { Current: 10, Max: 18, Temporary: 0 },
                        _self: `${SELF_BASE}/abc`
                    }
                ]
            });
            expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues).to.include({ ':pk': `USER#${OWNER}` });
        });

        it('follows DynamoDB pagination', async () => {
            ddbMock.on(QueryCommand)
                .resolvesOnce({ Items: [{ SK: 'CHARACTER#a', Name: 'A' }], LastEvaluatedKey: { PK: 'x', SK: 'y' } })
                .resolvesOnce({ Items: [{ SK: 'CHARACTER#b', Name: 'B' }] });

            const result = await lambdaHandler(buildEvent('GET'));

            expect(parse(result).count).to.equal(2);
            expect(ddbMock.commandCalls(QueryCommand)).to.have.length(2);
        });
    });

    describe('GET /characters/{id}', () => {
        it('returns the full character', async () => {
            ddbMock.on(GetCommand).resolves({ Item: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'Aria', Class: 'Magicien', Level: 5 } });

            const result = await lambdaHandler(buildEvent('GET', { id: 'abc' }));

            expect(result.statusCode).to.equal(200);
            expect(parse(result)).to.deep.equal({ id: 'abc', Name: 'Aria', Class: 'Magicien', Level: 5, ProficiencyBonus: 3, _self: `${SELF_BASE}/abc` });
            expect(ddbMock.commandCalls(GetCommand)[0].args[0].input.Key).to.deep.equal({ PK: `USER#${OWNER}`, SK: 'CHARACTER#abc' });
        });

        it('derives spellcasting stats from the class and the 2024 rules', async () => {
            const spellcastingOf = async (Class: string, Subclass: string, Abilities: Record<string, number>) => {
                ddbMock.on(GetCommand).resolves({ Item: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'X', Class, Subclass, Level: 5, Abilities } });
                return parse(await lambdaHandler(buildEvent('GET', { id: 'abc' }))).Spellcasting;
            };

            // Magicien niv. 5 (maîtrise +3), Intelligence 16 (+3) : DD 8 + 3 + 3, attaque +6
            expect(await spellcastingOf('Magicien', '', { Intelligence: 16 })).to.deep.equal({ Ability: 'Intelligence', Modifier: 3, SaveDC: 14, AttackBonus: 6, SpellSlots: { 1: 4, 2: 3, 3: 2 } });
            // Clerc : Sagesse (Wisdom 8 → -1) ; DD 8 + 3 - 1, attaque +2 ; classe insensible à la casse et aux accents
            expect(await spellcastingOf('CLERC', '', { Wisdom: 8, Intelligence: 20 })).to.deep.equal({ Ability: 'Wisdom', Modifier: -1, SaveDC: 10, AttackBonus: 2, SpellSlots: { 1: 4, 2: 3, 3: 2 } });
            expect((await spellcastingOf('Rôdeur', '', { Wisdom: 14 })).Ability).to.equal('Wisdom');
            expect((await spellcastingOf('Paladin', '', { Charisma: 14 })).Ability).to.equal('Charisma');
            // Classes sans incantation, sauf sous-classe lanceuse de sorts
            expect(await spellcastingOf('Barbare', '', { Intelligence: 16 })).to.equal(undefined);
            expect(await spellcastingOf('Guerrier', 'Champion', { Intelligence: 16 })).to.equal(undefined);
            expect((await spellcastingOf('Guerrier', 'Chevalier occulte', { Intelligence: 16 })).Ability).to.equal('Intelligence');
            expect((await spellcastingOf('Roublard', 'Escroc arcanique', { Intelligence: 16 })).SaveDC).to.equal(14);
            // Classe inconnue (homebrew)
            expect(await spellcastingOf('Chronomancien', '', { Intelligence: 16 })).to.equal(undefined);
        });

        it('computes spell slots per class and level (D&D 2024)', async () => {
            const slotsOf = async (Class: string, Subclass: string, Level: number) => {
                ddbMock.on(GetCommand).resolves({ Item: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'X', Class, Subclass, Level, Abilities: { Intelligence: 10 } } });
                return parse(await lambdaHandler(buildEvent('GET', { id: 'abc' }))).Spellcasting?.SpellSlots;
            };

            expect(await slotsOf('Magicien', '', 1)).to.deep.equal({ 1: 2 });
            expect(await slotsOf('Magicien', '', 20)).to.deep.equal({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 });
            // Demi-lanceur : dès le niveau 1 en 2024
            expect(await slotsOf('Paladin', '', 1)).to.deep.equal({ 1: 2 });
            expect(await slotsOf('Rôdeur', '', 5)).to.deep.equal({ 1: 4, 2: 2 });
            // Magie de pacte : tous les emplacements au même niveau
            expect(await slotsOf('Occultiste', '', 1)).to.deep.equal({ 1: 1 });
            expect(await slotsOf('Occultiste', '', 5)).to.deep.equal({ 3: 2 });
            expect(await slotsOf('Occultiste', '', 17)).to.deep.equal({ 5: 4 });
            // Tiers de lanceur : pas d'emplacement avant le niveau 3
            expect(await slotsOf('Guerrier', 'Chevalier occulte', 2)).to.deep.equal({});
            expect(await slotsOf('Guerrier', 'Chevalier occulte', 3)).to.deep.equal({ 1: 2 });
            expect(await slotsOf('Roublard', 'Escroc arcanique', 7)).to.deep.equal({ 1: 4, 2: 2 });
        });

        it('derives skill bonuses from abilities, proficiency and expertise', async () => {
            ddbMock.on(GetCommand).resolves({
                Item: {
                    PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'X', Class: 'Rôdeur', Level: 5,
                    Abilities: { Strength: 10, Dexterity: 14, Constitution: 10, Intelligence: 8, Wisdom: 16, Charisma: 10 },
                    SkillProficiencies: ['Survival', 'Stealth'],
                    SkillExpertise: ['Survival']
                }
            });

            const { Skills } = parse(await lambdaHandler(buildEvent('GET', { id: 'abc' })));
            const byKey = Object.fromEntries(Skills.map((skill: { Key: string }) => [skill.Key, skill]));

            expect(Skills).to.have.length(18);
            // Niveau 5 : maîtrise +3. Survie (Sagesse +3) avec expertise : 3 + 2 × 3
            expect(byKey.Survival).to.deep.equal({ Key: 'Survival', Ability: 'Wisdom', Bonus: 9, Proficiency: 'expertise' });
            // Discrétion (Dextérité +2) maîtrisée : 2 + 3
            expect(byKey.Stealth).to.deep.equal({ Key: 'Stealth', Ability: 'Dexterity', Bonus: 5, Proficiency: 'proficient' });
            // Histoire (Intelligence -1) non maîtrisée : modificateur seul
            expect(byKey.History).to.deep.equal({ Key: 'History', Ability: 'Intelligence', Bonus: -1, Proficiency: 'none' });
            expect(byKey.Athletics.Bonus).to.equal(0);
        });

        it('validates skill proficiencies on PATCH', async () => {
            ddbMock.on(UpdateCommand).resolves({ Attributes: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'X' } });

            const ok = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { SkillProficiencies: ['Survival', 'Survival'], SkillExpertise: [] } }));
            expect(ok.statusCode).to.equal(200);
            expect(ddbMock.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).to.deep.include({ ':SkillProficiencies': ['Survival'] });

            const bad = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { SkillProficiencies: ['Cooking'] } }));
            expect(bad.statusCode).to.equal(400);
        });

        it('derives saving throws from the class proficiencies', async () => {
            const savesOf = async (Class: string) => {
                ddbMock.on(GetCommand).resolves({
                    Item: {
                        PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'X', Class, Level: 5,
                        Abilities: { Strength: 16, Dexterity: 14, Constitution: 12, Intelligence: 8, Wisdom: 10, Charisma: 10 }
                    }
                });
                return parse(await lambdaHandler(buildEvent('GET', { id: 'abc' }))).SavingThrows;
            };

            // Guerrier niv. 5 (maîtrise +3) : Force et Constitution maîtrisées
            const fighter = await savesOf('Guerrier');
            expect(fighter.Strength).to.deep.equal({ Bonus: 6, Proficient: true });
            expect(fighter.Constitution).to.deep.equal({ Bonus: 4, Proficient: true });
            expect(fighter.Dexterity).to.deep.equal({ Bonus: 2, Proficient: false });
            expect(fighter.Intelligence).to.deep.equal({ Bonus: -1, Proficient: false });
            // Magicien : Intelligence et Sagesse ; nom de classe insensible à la casse et aux accents
            const wizard = await savesOf('MAGICIEN');
            expect(wizard.Intelligence).to.deep.equal({ Bonus: 2, Proficient: true });
            expect(wizard.Wisdom).to.deep.equal({ Bonus: 3, Proficient: true });
            expect((await savesOf('Rôdeur')).Dexterity.Proficient).to.equal(true);
            // Classe inconnue : aucune maîtrise
            expect((await savesOf('Chronomancien')).Strength).to.deep.equal({ Bonus: 3, Proficient: false });
        });

        it('returns 404 when the character does not exist', async () => {
            ddbMock.on(GetCommand).resolves({});

            const result = await lambdaHandler(buildEvent('GET', { id: 'nope' }));

            expect(result.statusCode).to.equal(404);
        });
    });

    describe('POST /characters', () => {
        it('creates a character with defaults and returns 201 with a Location header', async () => {
            ddbMock.on(PutCommand).resolves({});

            const result = await lambdaHandler(buildEvent('POST', { body: { Name: '  Aria ', Class: 'Magicien', Level: 3, Abilities: { Intelligence: 16 } } }));

            expect(result.statusCode).to.equal(201);
            const body = parse(result);
            expect(body.id).to.be.a('string');
            expect(body.Name).to.equal('Aria');
            expect(body.Level).to.equal(3);
            expect(body.ProficiencyBonus).to.equal(2);
            expect(body.Abilities).to.deep.equal({ Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 16, Wisdom: 10, Charisma: 10 });
            // Magicien niveau 3, Constitution 10 : 6 + 2 × (3 + 1 + 0) = 14
            expect(body.HitPoints).to.deep.equal({ Current: 14, Max: 14, Temporary: 0 });
            expect(body.Spells).to.deep.equal([]);
            expect(body._self).to.equal(`${SELF_BASE}/${body.id}`);
            expect((result.headers as Record<string, string>).Location).to.equal(body._self);

            const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
            expect(item.PK).to.equal(`USER#${OWNER}`);
            expect(item.SK).to.equal(`CHARACTER#${body.id}`);
        });

        it('computes max hit points from class, level and Constitution (D&D 2024)', async () => {
            ddbMock.on(PutCommand).resolves({});
            const create = async (body: Record<string, unknown>) => parse(await lambdaHandler(buildEvent('POST', { body }))).HitPoints;

            // Niveau 1 : dé de vie max + mod. Con. (Barbare d12, Con 16 → 12 + 3)
            expect(await create({ Name: 'Grog', Class: 'Barbare', Abilities: { Constitution: 16 } })).to.deep.equal({ Current: 15, Max: 15, Temporary: 0 });
            // Niveaux suivants : moyenne arrondie au supérieur (d10 → 6) + mod. Con. (Guerrier niv. 5, Con 14 → 12 + 4 × 8)
            expect((await create({ Name: 'A', Class: 'Guerrier', Level: 5, Abilities: { Constitution: 14 } })).Max).to.equal(44);
            // Malus de Constitution : au moins 1 PV par niveau (Magicien niv. 2, Con 1 → 1 + 1)
            expect((await create({ Name: 'B', Class: 'Magicien', Level: 2, Abilities: { Constitution: 1 } })).Max).to.equal(2);
            // Nom de classe insensible à la casse et aux accents
            expect((await create({ Name: 'C', Class: 'RÔDEUR' })).Max).to.equal(10);
            // PV max fournis explicitement : respectés
            expect(await create({ Name: 'D', Class: 'Clerc', HitPoints: { Max: 30 } })).to.deep.equal({ Current: 30, Max: 30, Temporary: 0 });
            // Classe inconnue : calcul impossible
            expect((await create({ Name: 'E', Class: 'Chronomancien' })).Max).to.equal(0);
        });

        it('derives the proficiency bonus from the level', async () => {
            ddbMock.on(PutCommand).resolves({});
            const bonusAt = async (Level: number) =>
                parse(await lambdaHandler(buildEvent('POST', { body: { Name: 'A', Class: 'Guerrier', Level } }))).ProficiencyBonus;

            const bonuses = [await bonusAt(1), await bonusAt(4), await bonusAt(5), await bonusAt(9), await bonusAt(13), await bonusAt(17), await bonusAt(20)];

            expect(bonuses).to.deep.equal([2, 2, 3, 4, 5, 6, 6]);
        });

        it('stores gold with at most 2 decimals', async () => {
            ddbMock.on(PutCommand).resolves({});
            const create = async (body: Record<string, unknown>) => lambdaHandler(buildEvent('POST', { body: { Name: 'A', Class: 'Clerc', ...body } }));

            expect(parse(await create({})).Gold).to.equal(0);
            expect(parse(await create({ Gold: 12.5 })).Gold).to.equal(12.5);
            // Erreur de flottant tolérée puis normalisée
            expect(parse(await create({ Gold: 0.1 + 0.2 })).Gold).to.equal(0.3);

            for (const bad of [1.234, -1, '5', null, 1e12]) {
                expect((await create({ Gold: bad })).statusCode).to.equal(400);
            }
        });

        it('rejects a missing Name and Class', async () => {
            const result = await lambdaHandler(buildEvent('POST', { body: { Level: 2 } }));

            expect(result.statusCode).to.equal(400);
            expect(parse(result).details).to.deep.equal(['"Name" est obligatoire', '"Class" est obligatoire']);
            expect(ddbMock.calls()).to.have.length(0);
        });

        it('rejects invalid values and unknown fields', async () => {
            const result = await lambdaHandler(buildEvent('POST', {
                body: { Name: 'Aria', Class: 'Magicien', Level: 21, Abilities: { Luck: 5, Strength: 0 }, PK: 'USER#other', Spells: [1] }
            }));

            expect(result.statusCode).to.equal(400);
            const details: string[] = parse(result).details;
            expect(details).to.include('"Level" doit être un entier entre 1 et 20');
            expect(details).to.include('Champ inconnu : "Abilities.Luck"');
            expect(details).to.include('"Abilities.Strength" doit être un entier entre 1 et 30');
            expect(details).to.include('Champ inconnu : "PK"');
            expect(details.some((d) => d.startsWith('"Spells"'))).to.equal(true);
            expect(ddbMock.calls()).to.have.length(0);
        });

        it('rejects a body that is not valid JSON', async () => {
            const result = await lambdaHandler(buildEvent('POST', { body: '{not json' }));

            expect(result.statusCode).to.equal(400);
        });
    });

    describe('PATCH /characters/{id}', () => {
        it('updates only the provided fields, including nested ones', async () => {
            ddbMock.on(UpdateCommand).resolves({ Attributes: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'Aria', HitPoints: { Current: 5, Max: 18, Temporary: 0 } } });

            const result = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { HitPoints: { Current: 5 }, Notes: 'Blessée' } }));

            expect(result.statusCode).to.equal(200);
            expect(parse(result).HitPoints).to.deep.equal({ Current: 5, Max: 18, Temporary: 0 });

            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            expect(input.Key).to.deep.equal({ PK: `USER#${OWNER}`, SK: 'CHARACTER#abc' });
            expect(input.UpdateExpression).to.equal('SET #UpdatedAt = :UpdatedAt, #HitPoints.#Current = :HitPoints_Current, #Notes = :Notes');
            expect(input.ConditionExpression).to.equal('attribute_exists(PK)');
            expect(input.ExpressionAttributeValues).to.include({ ':HitPoints_Current': 5, ':Notes': 'Blessée' });
        });

        it('returns 404 when the character does not exist', async () => {
            ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

            const result = await lambdaHandler(buildEvent('PATCH', { id: 'nope', body: { Level: 4 } }));

            expect(result.statusCode).to.equal(404);
        });

        it('replaces the used spell slots table and validates it', async () => {
            ddbMock.on(UpdateCommand).resolves({ Attributes: { PK: `USER#${OWNER}`, SK: 'CHARACTER#abc', Name: 'Aria', SpellSlotsUsed: { 1: 2 } } });

            const ok = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { SpellSlotsUsed: { 1: 2, 3: 1 } } }));
            expect(ok.statusCode).to.equal(200);
            const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
            expect(input.UpdateExpression).to.equal('SET #UpdatedAt = :UpdatedAt, #SpellSlotsUsed = :SpellSlotsUsed');
            expect(input.ExpressionAttributeValues).to.deep.include({ ':SpellSlotsUsed': { 1: 2, 3: 1 } });

            for (const bad of [{ 10: 1 }, { 1: 5 }, { 1: -1 }, 'x']) {
                const result = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { SpellSlotsUsed: bad } }));
                expect(result.statusCode).to.equal(400);
            }
        });

        it('rejects an empty modification', async () => {
            const result = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: {} }));

            expect(result.statusCode).to.equal(400);
            expect(ddbMock.calls()).to.have.length(0);
        });

        it('rejects invalid values', async () => {
            const result = await lambdaHandler(buildEvent('PATCH', { id: 'abc', body: { Name: '' } }));

            expect(result.statusCode).to.equal(400);
        });
    });

    describe('DELETE /characters/{id}', () => {
        it('deletes the character and returns 204', async () => {
            ddbMock.on(DeleteCommand).resolves({});

            const result = await lambdaHandler(buildEvent('DELETE', { id: 'abc' }));

            expect(result.statusCode).to.equal(204);
            expect(result.body).to.equal(undefined);
            expect(ddbMock.commandCalls(DeleteCommand)[0].args[0].input.Key).to.deep.equal({ PK: `USER#${OWNER}`, SK: 'CHARACTER#abc' });
        });

        it('returns 404 when the character does not exist', async () => {
            ddbMock.on(DeleteCommand).rejects(conditionalCheckFailed());

            const result = await lambdaHandler(buildEvent('DELETE', { id: 'nope' }));

            expect(result.statusCode).to.equal(404);
        });

        it('returns 500 on unexpected DynamoDB errors', async () => {
            ddbMock.on(DeleteCommand).rejects(new Error('boom'));

            const result = await lambdaHandler(buildEvent('DELETE', { id: 'abc' }));

            expect(result.statusCode).to.equal(500);
        });
    });
});
