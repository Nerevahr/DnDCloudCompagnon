import { CognitoJwtVerifier } from "aws-jwt-verify";

// Le navigateur ne peut pas poser de header Authorization sur un WebSocket : le jeton d'accès Cognito arrive en query
// string et est vérifié ici (signature, expiration, émetteur, client). Retourne le "sub" de l'utilisateur, ou
// undefined si le jeton est invalide. Objet plutôt que fonction exportée pour pouvoir le remplacer dans les tests.
let verifier: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

export const auth = {
    verify: async (token: string): Promise<string | undefined> => {
        try {
            verifier ??= CognitoJwtVerifier.create({
                userPoolId: process.env.USER_POOL_ID!,
                clientId: process.env.USER_POOL_CLIENT_ID!,
                tokenUse: "access"
            });
            const payload = await verifier.verify(token);
            return payload.sub;
        } catch {
            return undefined;
        }
    }
};
