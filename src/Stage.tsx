import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Character, User} from "@chub-ai/stages-ts";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly monologuePrompt: string = '[Rather than continue the narration, use this response to transcribe a couple brief sentences of {{char}}\'s current first-person thoughts about the past few moments of the scene, shaped by personality, motives, and recent events. Describe their honest opinions and the reactions they are considering in the moment]';

    // chatState
    messageParentIds: {[key: string]: string};
    messageBodies: {[key: string]: string};

    // messageState
    monologues: {[key: string]: string};
    messageId: string;

    // other
    characters: {[key: string]: Character};
    user: User;


    formatPrompt(characterId: string|null): string {
        return (!characterId || !this.monologues[characterId]) ? '' :
            `[These are ${this.characters[characterId].name}'s internal thoughts: ${this.monologues[characterId]}\nTacitly consider these thoughts when depicting this character's actions or dialog.]`;
    }

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {

        super(data);
        const {
            characters,
            users,
            config,
            messageState,
            chatState
        } = data;
        this.characters = characters;
        this.user = users[Object.keys(users)[0]];
        this.monologues = {};
        this.messageId = '';
        this.messageParentIds = {};
        this.messageBodies = {};
        this.readChatState(chatState);
        this.readMessageState(messageState);
    }

    async load(): Promise<Partial<LoadResponse<InitStateType, ChatStateType, MessageStateType>>> {

        return {
            success: true,
            error: null,
            initState: null,
            chatState: this.writeChatState(),
        };
    }

    readMessageState(messageState: MessageStateType) {
        this.monologues = messageState.monologues ?? {};
        this.messageId = messageState.messageId ?? '';
    }

    writeMessageState(): MessageStateType {
        return {
            monologues: this.monologues,
            messageId: this.messageId
        };
    }

    readChatState(chatState: ChatStateType) {
        this.messageBodies = chatState.messageBodies ?? {};
        this.messageParentIds = chatState.messageParentIds ?? {};
    }

    writeChatState(): ChatStateType {
        return {
            messageBodies: this.messageBodies,
            messageParentIds: this.messageParentIds
        };
    }

    buildHistory(messageId: string): string {
        let currentId = messageId;
        let historyString = this.messageBodies[currentId] ?? '';
        let depth = 0;
        while(this.messageParentIds[currentId] && depth < 10) {
            currentId = this.messageParentIds[currentId];
            historyString = `${historyString}\n\n${this.messageBodies[currentId] ?? ''}`;
            depth++;
        }

        return historyString;
    }

    async setState(messageState: MessageStateType): Promise<void> {
        this.readMessageState(messageState);
    }

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        const {
            content,
            isBot,
            promptForId,
            identity
        } = userMessage;
        console.log('testing: ' + content + ';' + isBot + ';' + promptForId + ';' + identity);
        this.messageParentIds[identity] = this.messageId;
        this.messageId = identity;
        this.messageBodies[identity] = `###Input: ${this.user.name}: ${content}`;
        if (promptForId && this.characters[promptForId] && promptForId != this.user.anonymizedId) {
            console.log('generating');
            // Build monologue prompt:
            const promptedCharacter = this.characters[promptForId];
            const history = this.buildHistory(this.messageId);
            let monologuePrompt = `[INST]\n### Instruction:\n${promptedCharacter.system_prompt}\n` +
                `About ${promptedCharacter.name}: ${promptedCharacter.description}\n${promptedCharacter.personality}\n` +
                `Circumstances and context of the dialogue: ${promptedCharacter.scenario}\n` +
                `About ${this.user.name}: ${this.user.chatProfile}\n` +
                `[/INST]\n${history}\n${promptedCharacter.post_history_instructions}\n` +
                `${this.monologuePrompt}`;

            let result = await this.generator.textGen({
                prompt: monologuePrompt,
                min_tokens: 50,
                max_tokens: 200
            });
            if (result) {
                console.log('result:' + result.result);
            } else {
                console.log('no result');
            }
            this.monologues[promptForId] = result ? result.result : '';
        }
        console.log('after: ' + promptForId + ":" + this.formatPrompt(promptForId));
        return {
            stageDirections: this.formatPrompt(promptForId),
            messageState: this.writeMessageState(),
            modifiedMessage: null,
            systemMessage: null,
            error: null,
            chatState: this.writeChatState(),
        };
    }

    async afterResponse(botMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {
        /***
         This is called immediately after a response from the LLM.
         ***/
        const {
            identity,
            content,
            anonymizedId,
            isBot
        } = botMessage;

        console.log('testing2: ' + content + ';' + isBot);
        this.messageParentIds[identity] = this.messageId;
        this.messageId = identity;
        this.messageBodies[identity] = `###Response: ${this.characters[anonymizedId]}: ${content}`;

        return {
            stageDirections: null,
            messageState: this.writeMessageState(),
            modifiedMessage: null,
            error: null,
            systemMessage: null,
            chatState: this.writeChatState()
        };
    }

    
    render(): ReactElement {
        return (<div></div>);
    }

}
