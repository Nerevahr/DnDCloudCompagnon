import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, tableName } from "@dndcloud/core";

const SPELL_ID_PREFIX = "SPELL#";

// Ajoute "AND #alias IN (:prefix0, :prefix1, ...)" à l'expression si des valeurs sont fournies.
// Les noms d'attributs passent par ExpressionAttributeNames car certains (ex: "Level") sont des mots réservés DynamoDB.
function appendInClause(
    filterExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames: Record<string, string>,
    attributeName: string,
    placeholderPrefix: string,
    values: (string | number)[]
): string {
    if (!values || values.length === 0) {
        return filterExpression;
    }

    const nameAlias = `#${placeholderPrefix}`;
    expressionAttributeNames[nameAlias] = attributeName;

    const placeholders = values.map((value, index) => {
        const placeholder = `:${placeholderPrefix}${index}`;
        expressionAttributeValues[placeholder] = value;
        return placeholder;
    });

    return `${filterExpression} AND ${nameAlias} IN (${placeholders.join(", ")})`;
}

// Ajoute "AND (contains(#alias, :prefix0) OR contains(#alias, :prefix1) OR ...)" à l'expression.
// Utilisé pour les attributs de type liste (ex: "Classes"), où IN ne fonctionne pas.
function appendContainsAnyClause(
    filterExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    expressionAttributeNames: Record<string, string>,
    attributeName: string,
    placeholderPrefix: string,
    values: string[]
): string {
    if (!values || values.length === 0) {
        return filterExpression;
    }

    const nameAlias = `#${placeholderPrefix}`;
    expressionAttributeNames[nameAlias] = attributeName;

    const conditions = values.map((value, index) => {
        const placeholder = `:${placeholderPrefix}${index}`;
        expressionAttributeValues[placeholder] = value;
        return `contains(${nameAlias}, ${placeholder})`;
    });

    return `${filterExpression} AND (${conditions.join(" OR ")})`;
}

// Récupère la liste des sorts (SPELL#), éventuellement filtrés par écoles de magie, niveaux et/ou classes.
// Ne remonte que les informations minimales (nom, niveau, école, classes) afin de garder le body léger :
// le détail complet d'un sort est disponible via getSpellById.
export const scanSpells = async (schoolFilters: string[], levelFilters: number[], classFilters: string[], tagFilters: string[]) => {
    let filterExpression = "begins_with(PK, :prefix) AND SK = :metadata";
    const expressionAttributeValues: Record<string, unknown> = {
        ":prefix": "SPELL#",
        ":metadata": "METADATA"
    };
    // Name, Level et Classes sont des mots réservés DynamoDB : ils doivent passer par des alias
    const expressionAttributeNames: Record<string, string> = {
        "#pName": "Name",
        "#pLevel": "Level",
        "#pSchool": "School",
        "#pClasses": "Classes",
        "#pTags": "Tags"
    };

    filterExpression = appendInClause(filterExpression, expressionAttributeValues, expressionAttributeNames, "School", "school", schoolFilters);
    filterExpression = appendInClause(filterExpression, expressionAttributeValues, expressionAttributeNames, "Level", "level", levelFilters);
    filterExpression = appendContainsAnyClause(filterExpression, expressionAttributeValues, expressionAttributeNames, "Classes", "class", classFilters);
    filterExpression = appendContainsAnyClause(filterExpression, expressionAttributeValues, expressionAttributeNames, "Tags", "tag", tagFilters);

    const command = new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExpression,
        ProjectionExpression: "PK, #pName, #pLevel, #pSchool, #pClasses, #pTags",
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames
    });

    const data = await docClient.send(command);

    return {
        count: data.Count ?? 0,
        spells: (data.Items ?? []).map(({ PK, SK, ...spell }) => ({
            id: (PK as string).slice(SPELL_ID_PREFIX.length),
            ...spell
        }))
    };
};

// Récupère le détail complet d'un sort à partir de son identifiant (slug), ou undefined s'il n'existe pas
export const getSpellById = async (id: string) => {
    const command = new GetCommand({
        TableName: tableName,
        Key: {
            PK: `${SPELL_ID_PREFIX}${id}`,
            SK: "METADATA"
        }
    });

    const data = await docClient.send(command);

    if (!data.Item) {
        return undefined;
    }

    const { PK, SK, ...spell } = data.Item;

    return { id, ...spell };
};
