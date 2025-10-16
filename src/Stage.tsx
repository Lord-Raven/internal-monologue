import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, TextResponse} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Character, User} from "@chub-ai/stages-ts";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly DEFAULT_GENERATION_PROMPT = `Deeply analyze and consider {{char}}'s description and recent events in this narrative, then output a couple sentences summarizing {{char}}'s current, honest thoughts, shaped by their personality, motives, other characters, and ongoing events. Describe their true opinions and the actions they are considering in this moment before promptly ending this response.`
    readonly DEFAULT_REQUEST_PROMPT = `This is a summary of {{char}}'s current internal thoughts:\n\n{{content}}\n\nIf {{char}} is present in this scene, be sure to implicitly weigh these thoughts and motives when depicting their actions or dialogue.`;

    // messageState
    monologues: {[key: string]: string};

    // other
    characters: {[key: string]: Character};
    users: {[key: string]: User};
    generationPrompt: string;
    requestPrompt: string;
    perSwipeMode: boolean;

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {

        super(data);
        const {
            characters,
            users,
            config,
            messageState
        } = data;
        this.characters = characters;
        this.users = users;
        this.monologues = {};
        this.readMessageState(messageState);
        this.generationPrompt = config?.generationPrompt ?? this.DEFAULT_GENERATION_PROMPT;
        this.requestPrompt = config?.requestPrompt ?? this.DEFAULT_REQUEST_PROMPT;
        this.perSwipeMode = false;//'Per Input' !== config?.perSwipeMode;
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        return {
            success: true,
            error: null,
            initState: null,
            chatState: null
        };
    }

    readMessageState(messageState: MessageStateType) {
        if (messageState) {
            console.log('readMessageState');
            console.log(messageState);
            this.monologues = messageState.monologues ?? {};
        }
    }

    writeMessageState(): MessageStateType {
        return {
            monologues: this.monologues,
        };
    }

    replaceTags(source: string, replacements: {[name: string]: string}) {
        return source.replace(/{{([A-z]*)}}/g, (match) => {
            return replacements[match.substring(2, match.length - 2)];
        });
    }

    async setState(messageState: MessageStateType): Promise<void> {
        console.log('setState');
        this.readMessageState(messageState);
    }

    async generateMonologue(characterId: string, userId: string, historyAddition: string) {
        if (characterId && this.characters[characterId] && userId && this.users[userId]) {
            // Build monologue prompt:
            const char = this.characters[characterId];
            const user = this.users[userId];
            let monologuePrompt = `{{system_prompt}}\n\n` +
                `About {{char}}:\n${char.description} ${char.personality}\n\n` +
                `About {{user}}:\n${user.chatProfile}\n\n` +
                `Conversation history:\n{{messages}}\n${historyAddition}\n` + // Potentially include new message from user
                `Current Instruction:\n${this.generationPrompt}\n`

            console.log('Monologue prompt:\n' + monologuePrompt);
            let result: TextResponse|null = await this.generator.textGen({
                prompt: monologuePrompt,
                min_tokens: 50,
                max_tokens: 150,
                include_history: true
            });
            if (result) {
                console.log('Monologue result:');
                console.log(result.result);
            } else {
                console.log('No monologue result.');
            }
            this.monologues[characterId] = result ? result.result : '';
        }
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        const {
            content,
            promptForId,
            anonymizedId
        } = userMessage;

        if (!this.perSwipeMode) {
            await this.generateMonologue(promptForId ?? '', anonymizedId, `{{user}}: ${content}\n`);
        }

        return {
            stageDirections: promptForId && this.characters[promptForId] && this.monologues[promptForId] ? 
                this.replaceTags(this.requestPrompt, {'char': this.characters[promptForId].name, 'content': this.monologues[promptForId]}) : '',
            messageState: this.writeMessageState(),
            modifiedMessage: null,
            systemMessage: null,
            error: null,
            chatState: null,
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        return {
            stageDirections: null,
            messageState: this.writeMessageState(),
            modifiedMessage: null,
            error: null,
            systemMessage: null,
            chatState: null
        };
    }

    render(): ReactElement {
        return <></>;
    }

}
