# DnDCloudCompagnon

This project contains source code and supporting files for a serverless application that you can deploy with the SAM CLI. It includes the following files and folders.

- spells-api - Code for the spells API Lambda function.
- feats-api - Code for the feats API Lambda function.
- items-api - Code for the items API Lambda function.
- characters-api - Code for the player characters API Lambda function (read/write, scoped to the authenticated Cognito user). See "Characters API" below.
- core - Shared infrastructure code (`@dndcloud/core`): DynamoDB client, HTTP responses, self-link building, string normalization. See "Shared code (`core`)" below.
- events - Invocation events that you can use to invoke the function.
- spells-api/tests, feats-api/tests, items-api/tests - Unit tests for the application code. 
- template.yaml - A template that defines the application's AWS resources.

## Shared code (`core`)

`spells-api`, `feats-api`, `items-api` and `characters-api` share infrastructure code (the DynamoDB client, the JSON HTTP response helpers, absolute self-link building, accent/case-insensitive string normalization) through a local package, `@dndcloud/core` (folder `core/`). It is TypeScript source only, no build step of its own.

This repo is an **npm workspace** (`package.json` at the root lists `core`, `spells-api`, `feats-api`, `items-api`, `characters-api`): run `npm install` once at the repo root, not inside each `*-api` folder. That single install links `@dndcloud/core` into every workspace member so `tsc`, `tsx`/mocha and your IDE resolve it directly.

`sam build` needs to see the same code, but esbuild's `NodejsNpmEsbuildBuilder` builds each function in an isolated copy of its `CodeUri` and runs its own `npm install` there — it never sees the workspace symlinks, and a plain `"@dndcloud/core": "*"` dependency would fail with a 404 against the public npm registry. That's what the `_core` symlink inside each `*-api` folder is for (`feats-api/_core -> ../core`, etc.), paired with a `"@dndcloud/core": "file:./_core"` dependency in that API's `package.json`: SAM's isolated copy dereferences the symlink into a real folder, so the isolated `npm install` resolves it locally and esbuild bundles it into `app.js`. Don't delete the `_core` symlinks or point the dependency back at `"*"` — that's what makes `sam build` work.

The SAM CLI's incremental build cache (`cached = true`) does not replay this correctly on repeat builds (it takes a `LinkSource` shortcut that can leave `@dndcloud/core` unresolved), so `samconfig.toml` sets `cached = false` for the `build` command. Builds are fast enough for this project's size that this isn't noticeable.

The application uses several AWS resources, including Lambda functions and an API Gateway API. These resources are defined in the `template.yaml` file in this project. You can update the template to add AWS resources through the same deployment process that updates your application code.

If you prefer to use an integrated development environment (IDE) to build and test your application, you can use the AWS Toolkit.  
The AWS Toolkit is an open source plug-in for popular IDEs that uses the SAM CLI to build and deploy serverless applications on AWS. The AWS Toolkit also adds a simplified step-through debugging experience for Lambda function code. See the following links to get started.

* [CLion](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [GoLand](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [IntelliJ](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [WebStorm](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [Rider](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [PhpStorm](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [PyCharm](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [RubyMine](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [DataGrip](https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/welcome.html)
* [VS Code](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/welcome.html)
* [Visual Studio](https://docs.aws.amazon.com/toolkit-for-visual-studio/latest/user-guide/welcome.html)

## Deploy the sample application

The Serverless Application Model Command Line Interface (SAM CLI) is an extension of the AWS CLI that adds functionality for building and testing Lambda applications. It uses Docker to run your functions in an Amazon Linux environment that matches Lambda. It can also emulate your application's build environment and API.

To use the SAM CLI, you need the following tools.

* SAM CLI - [Install the SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html)
* Node.js - [Install Node.js 24](https://nodejs.org/en/), including the NPM package management tool.
* Docker - [Install Docker community edition](https://hub.docker.com/search/?type=edition&offering=community)

To build and deploy your application for the first time, run the following in your shell:

```bash
sam build
sam deploy --guided
```

The first command will build the source of your application. The second command will package and deploy your application to AWS, with a series of prompts:

* **Stack Name**: The name of the stack to deploy to CloudFormation. This should be unique to your account and region, and a good starting point would be something matching your project name.
* **AWS Region**: The AWS region you want to deploy your app to.
* **Confirm changes before deploy**: If set to yes, any change sets will be shown to you before execution for manual review. If set to no, the AWS SAM CLI will automatically deploy application changes.
* **Allow SAM CLI IAM role creation**: Many AWS SAM templates, including this example, create AWS IAM roles required for the AWS Lambda function(s) included to access AWS services. By default, these are scoped down to minimum required permissions. To deploy an AWS CloudFormation stack which creates or modifies IAM roles, the `CAPABILITY_IAM` value for `capabilities` must be provided. If permission isn't provided through this prompt, to deploy this example you must explicitly pass `--capabilities CAPABILITY_IAM` to the `sam deploy` command.
* **Save arguments to samconfig.toml**: If set to yes, your choices will be saved to a configuration file inside the project, so that in the future you can just re-run `sam deploy` without parameters to deploy changes to your application.

You can find your API Gateway Endpoint URL in the output values displayed after deployment.

## Use the SAM CLI to build and test locally

Build your application with the `sam build` command.

```bash
DnDCloudCompagnon$ sam build
```

The SAM CLI installs dependencies defined in `spells-api/package.json`, creates a deployment package, and saves it in the `.aws-sam/build` folder.

Test a single function by invoking it directly with a test event. An event is a JSON document that represents the input that the function receives from the event source. Test events are included in the `events` folder in this project.

Run functions locally and invoke them with the `sam local invoke` command.

```bash
DnDCloudCompagnon$ sam local invoke SpellsApiFunction --event events/event.json
```

The SAM CLI can also emulate your application's API. Use the `sam local start-api` to run the API locally on port 3000.

```bash
DnDCloudCompagnon$ sam local start-api
DnDCloudCompagnon$ curl http://localhost:3000/api/v1/spells
```

The SAM CLI reads the application template to determine the API's routes and the functions that they invoke. The `Events` property on each function's definition includes the route and method for each path.

```yaml
      Events:
        ListSpells:
          Type: HttpApi
          Properties:
            Path: /api/v1/spells
            Method: get
```

## Add a resource to your application
The application template uses AWS Serverless Application Model (AWS SAM) to define application resources. AWS SAM is an extension of AWS CloudFormation with a simpler syntax for configuring common serverless application resources such as functions, triggers, and APIs. For resources not included in [the SAM specification](https://github.com/awslabs/serverless-application-model/blob/master/versions/2016-10-31.md), you can use standard [AWS CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html) resource types.

## Fetch, tail, and filter Lambda function logs

To simplify troubleshooting, SAM CLI has a command called `sam logs`. `sam logs` lets you fetch logs generated by your deployed Lambda function from the command line. In addition to printing the logs on the terminal, this command has several nifty features to help you quickly find the bug.

`NOTE`: This command works for all AWS Lambda functions; not just the ones you deploy using SAM.

```bash
DnDCloudCompagnon$ sam logs -n SpellsApiFunction --stack-name DnDCloudCompagnon --tail
```

You can find more information and examples about filtering Lambda function logs in the [SAM CLI Documentation](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-logging.html).

## Characters API

Unlike the compendium APIs, `characters-api` is read/write. Every route requires a Cognito JWT, and a character belongs to the user whose `sub` claim is in the token (stored as `PK = USER#<sub>`, `SK = CHARACTER#<id>`), so users only ever see and modify their own characters.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/characters` | List the caller's characters (summary fields) |
| POST | `/api/v1/characters` | Create a character (`Name` and `Class` required) → 201 + `Location` |
| GET | `/api/v1/characters/{id}` | Full character |
| PATCH | `/api/v1/characters/{id}` | Partial update; nested objects merge (`{"HitPoints": {"Current": 5}}` leaves `Max` untouched) |
| DELETE | `/api/v1/characters/{id}` | Delete → 204 |

Fields: `Name`, `Class`, `Subclass`, `Species`, `Background`, `Notes`, `Level` (1-20), `ArmorClass`, `Abilities` (`Strength`…`Charisma`, 1-30), `HitPoints` (`Current`, `Max`, `Temporary`), and `Spells` / `Feats` / `Items` (lists of compendium ids). Unknown fields are rejected with a 400.

On creation, `HitPoints.Max` is computed with the D&D 2024 rules from the class hit die, the level and the Constitution modifier (level 1: max die + modifier; each further level: average die rounded up + modifier, at least 1 per level), and `HitPoints.Current` starts at that maximum. A `HitPoints.Max` sent explicitly wins (e.g. rolled hit points), and an unknown class (homebrew) leaves it at 0. Class names are matched case- and accent-insensitively (`lib/hitPoints.ts`). PATCH never recomputes hit points.

Responses for a single character also include `ProficiencyBonus` (+2 at levels 1-4 up to +6 at levels 17-20). It is derived from `Level` on every read and never stored, so it cannot go stale. When the class can cast spells (2024 rules: Bard/Paladin/Sorcerer/Warlock Charisma, Cleric/Druid/Ranger Wisdom, Wizard Intelligence, plus the Eldritch Knight and Arcane Trickster subclasses, matched by their French names *Chevalier occulte* and *Escroc arcanique*), they also include `Spellcasting`: `Ability`, `Modifier`, `SaveDC` (8 + proficiency + modifier) and `AttackBonus` (proficiency + modifier). `Spellcasting.SpellSlots` gives the total slots per spell level from the 2024 tables (full, half and third casters, and the Warlock's Pact Magic). Classes that do not cast get no `Spellcasting` key. Skills: `SkillProficiencies` and `SkillExpertise` (lists of skill keys such as `Survival`, `SleightOfHand`) are stored, and responses carry a derived `Skills` list of the 18 skills with their `Ability`, `Bonus` (ability modifier, + proficiency, or + twice the proficiency with expertise) and `Proficiency` (`none`, `proficient`, `expertise`). Responses also carry `SavingThrows`: for each ability, the saving throw `Bonus` and whether the class makes it `Proficient` (two per class, 2024 rules; an unknown class has none). `Gold` (gold pieces, default 0) accepts at most 2 decimals and is rounded to the hundredth. Spent slots are stored in `SpellSlotsUsed` (`{"1": 2}`; PATCH replaces the whole map).

CloudFront serves `/api/v1/characters*` through its own behavior (no caching, all HTTP methods), and the webapp's service worker excludes these routes from its API cache. `sam local start-api` does not run the JWT authorizer, so local calls get a 401 unless you inject an authorizer context in the event.

## Unit tests

Tests are defined in the `spells-api/tests`, `feats-api/tests`, `items-api/tests` and `characters-api/tests` folders in this project, using the [Mocha test framework](https://mochajs.org/). Install dependencies once at the repo root (this is an npm workspace, see "Shared code (`core`)" above), then run each API's tests from its own folder:

```bash
DnDCloudCompagnon$ npm install
DnDCloudCompagnon$ cd spells-api
spells-api$ npm run test
```

## Cleanup

To delete the sample application that you created, use the AWS CLI. Assuming you used your project name for the stack name, you can run the following:

```bash
sam delete --stack-name DnDCloudCompagnon
```

## Resources

See the [AWS SAM developer guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html) for an introduction to SAM specification, the SAM CLI, and serverless application concepts.

Next, you can use AWS Serverless Application Repository to deploy ready to use Apps that go beyond hello world samples and learn how authors developed their applications: [AWS Serverless Application Repository main page](https://aws.amazon.com/serverless/serverlessrepo/)
