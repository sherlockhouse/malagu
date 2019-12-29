import { resolve } from 'path';
import { existsSync, copy, readJSON, writeJSON } from 'fs-extra';
const inquirer = require('inquirer');
import request = require('request-promise');
import { templates } from './templates';
import { spawnSync } from 'child_process';
import { HookExecutor } from '../hook/hook-executor';
import { CliContext, HookContext } from '../context';
import * as ora from 'ora';
import { getPackager } from '../packager';
const chalk = require('chalk');

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

const SEARCH_TEMPLATE_REPO_URI = 'https://api.github.com/search/repositories?q=topic:malagu-template&sort=stars&order=desc';

const PLACEHOLD = '{{ templatePath }}';

export interface Template {
    name: string;
    location: string;
}

export class InitManager {

    protected source: any[];
    protected name: string;
    protected location: string;
    protected cliContext: CliContext;
    constructor(protected readonly context: any) {

    }

    async output(): Promise<void> {
        await this.selectTemplate();
        await this.checkOutputDir();
        await this.doOutput();
    }

    async render(): Promise<void> {
        const packageJsonPath = resolve(this.outputDir, 'package.json');
        const packageJson = await readJSON(packageJsonPath, { encoding: 'utf8' });
        packageJson.name = this.context.name;
        await writeJSON(packageJsonPath, packageJson, { encoding: 'utf8', spaces: 2 });
    }

    async install(): Promise<void> {
        const ctx = await this.getCliContext();
        const packagerId = ctx.pkg.rootConfig.malagu.packager;
        await getPackager(packagerId).install(this.outputDir, {});
    }

    async executeHooks(): Promise<void> {
        const outputDir = this.outputDir;
        process.chdir(outputDir);
        await new HookExecutor().executeInitHooks(await HookContext.create(await this.getCliContext()));
        console.log(chalk`{bold.green Success!} Initialized "${ this.name }" example in {bold.blue ${outputDir}}.`);
        process.exit(0);
    }

    protected async getCliContext() {
        if (!this.cliContext) {
            this.cliContext = await CliContext.create(this.context.program, [], this.outputDir);
            this.cliContext.name = this.context.name;
            this.cliContext.outputDir = this.context.outputDir;
        }
        return this.cliContext;
    }

    protected get outputDir(): string {
        return resolve(process.cwd(), this.context.outputDir, this.context.name);
    }

    protected async checkOutputDir() {
        if (existsSync(this.outputDir)) {
            const answers = await inquirer.prompt([{
                name: 'overwrite',
                type: 'confirm',
                message: 'App already exists, overwrite the app'
            }]);
            if (!answers.overwrite) {
                process.exit(-1);
            }
        }
    }

    protected toOfficialTemplate(name: string, location: string) {
        return { name: `${name} ${chalk.italic.gray('Official')}`, value: { location, name} };
    }

    protected toThirdPartyTemplate(item: any) {
        return { name: `${item.name} ${chalk.italic.gray(item.stargazers_count + '⭑')}`, value: { location: item.clone_url, name: item.name }};
    }

    protected async selectTemplate(): Promise<void> {
        const answers = await inquirer.prompt([{
            name: 'item',
            type: 'autocomplete',
            message: 'Select a template to init',
            source: async (answersSoFar: any, input: string) => {
                if (!this.source) {
                    const spinner = ora({ text: 'loading...', discardStdin: false }).start();
                    const options = {
                        uri: SEARCH_TEMPLATE_REPO_URI,
                        json: true,
                        timeout: 5000,
                        headers: {
                            'User-Agent': 'Malagu CLI'
                        }
                    };
                    const officialTemplates = Object.keys(templates).map(key => this.toOfficialTemplate(key, templates[key]));
                    try {
                        const { items } = await request(options);
                        const thirdPartyTemplates = items.map((item: any) => this.toThirdPartyTemplate(item));
                        this.source = [...officialTemplates, ...thirdPartyTemplates];
                    } catch (error) {
                        this.source = officialTemplates;
                        return this.source;
                    } finally {
                        spinner.stop();
                    }
                }
                return this.source.filter(item => !input || item.name.toLowerCase().includes(input.toLowerCase()));
            }
        }]);
        this.name = answers.item.name;
        this.context.name = this.context.name || answers.item.name;
        this.location = answers.item.location;
    }

    protected isLocalTemplate() {
        return !this.location.startsWith('http');
    }

    protected get realLocation() {
        return this.location.replace(PLACEHOLD, resolve(__dirname, '..', '..', 'templates'));
    }

    protected async doOutput() {
        if (this.isLocalTemplate()) {
            await this.outputLocalTemplate();
        } else {
            this.outputRemoteTempate();
        }
    }
    protected async outputLocalTemplate() {
        await copy(this.realLocation, this.outputDir);
    }

    protected outputRemoteTempate() {
        spawnSync('git', ['clone', '--depth=1', this.location, this.outputDir], { stdio: 'inherit' });
    }
}
