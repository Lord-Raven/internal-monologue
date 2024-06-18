import {ReactElement} from "react";
import {StageBase, StageResponse, InitialData, Message, TextResponse} from "@chub-ai/stages-ts";
import {LoadResponse} from "@chub-ai/stages-ts/dist/types/load";
import {Character, User} from "@chub-ai/stages-ts";

type MessageStateType = any;

type ConfigType = any;

type InitStateType = any;

type ChatStateType = any;

export class Stage extends StageBase<InitStateType, ChatStateType, MessageStateType, ConfigType> {

    readonly monologuePrompt: string = '[INST]Analyze {{char}}\'s description and recent events in this narrative chat log, then output a couple brief sentences of {{char}}\'s current first-person thoughts about the past few moments of the scene, shaped by personality, motives, and recent events. Describe their honest opinions and the actions they are considering in the moment.[/INST]';

    // chatState
    messageParentIds: {[key: string]: string};
    messageBodies: {[key: string]: string};

    // messageState
    monologues: {[key: string]: string};
    messageId: string;

    // other
    characters: {[key: string]: Character};
    user: User;
    //perSwipeMode: boolean;


    formatPrompt(characterId: string|null): string {
        return (!characterId || !this.monologues[characterId]) ? '' :
            `[INST]These are ${this.characters[characterId].name}'s internal thoughts: ${this.monologues[characterId]}\nTacitly consider these thoughts when depicting this character's actions or dialog.[/INST]`;
    }

    constructor(data: InitialData<InitStateType, ChatStateType, MessageStateType, ConfigType>) {

        super(data);
        const {
            characters,
            users,
            //config,
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
        //this.perSwipeMode = 'Per Input' !== config?.perSwipeMode;
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
        if (messageState) {
            console.log('readMessageState');
            console.log(messageState);
            this.monologues = messageState.monologues ?? {};
            this.messageId = messageState.messageId ?? '';
        }
    }

    writeMessageState(): MessageStateType {
        return {
            monologues: this.monologues,
            messageId: this.messageId
        };
    }

    readChatState(chatState: ChatStateType) {
        if (chatState) {
            console.log('readChatState');
            console.log(chatState);
            this.messageBodies = chatState.messageBodies ?? {};
            this.messageParentIds = chatState.messageParentIds ?? {};
        }
    }

    writeChatState(): ChatStateType {
        return {
            messageBodies: this.messageBodies ?? {},
            messageParentIds: this.messageParentIds ?? {}
        };
    }

    buildHistory(messageId: string): string {
        let currentId = messageId;
        let historyString = this.messageBodies[currentId] ?? '';
        let depth = 0;
        while(this.messageParentIds[currentId] && this.messageParentIds[currentId] != currentId && depth < 10) {
            currentId = this.messageParentIds[currentId];
            historyString = `${this.messageBodies[currentId] ?? ''}\n\n${historyString}`;
            //console.log(currentId + ":" + this.messageBodies[currentId]);
            depth++;
        }

        return historyString;
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

    async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<ChatStateType, MessageStateType>>> {

        const {
            content,
            isBot,
            promptForId,
            identity
        } = userMessage;
        console.log('testing: ' + content + ';' + isBot + ';' + promptForId + ';' + identity + ';' + this.messageId);
        this.messageParentIds[identity] = this.messageId;
        this.messageId = identity;
        this.messageBodies[identity] = `###Input: ${this.user.name}: ${content}`;

        await this.generateMonologue(promptForId ?? '');

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
        const {
            identity,
            content,
            anonymizedId,
            isBot
        } = botMessage;

        console.log('testing2: ' + content + ';' + isBot);
        this.messageParentIds[identity] = this.messageId;
        this.messageId = identity;
        this.messageBodies[identity] = this.replaceTags(`###Response: {{char}}: ${content}`, {"user": this.user.name, "char": this.characters[anonymizedId].name});

        return {
            stageDirections: null,
            messageState: this.writeMessageState(),
            modifiedMessage: null,
            error: null,
            systemMessage: null,
            chatState: this.writeChatState()
        };
    }

    async generateMonologue(characterId: string) {
        if (characterId && this.characters[characterId] && characterId != this.user.anonymizedId) {
            // Build monologue prompt:
            const promptedCharacter = this.characters[characterId];
            const history = this.buildHistory(this.messageId);
            let monologuePrompt = `[INST]\n### Instruction:\n${promptedCharacter.system_prompt}\n` +
                //`About ${promptedCharacter.name}: ${promptedCharacter.description}\n${promptedCharacter.personality}\n` +
                //`Circumstances and context of the dialogue: ${promptedCharacter.scenario}\n` +
                //`About ${this.user.name}: ${this.user.chatProfile}\n` +
                //`[/INST]\n${history}\n${promptedCharacter.post_history_instructions}\n` +
                `${this.monologuePrompt}`;

            monologuePrompt = this.replaceTags(monologuePrompt, {"user": this.user.name, "char": promptedCharacter.name, "original": ''});
            //let retries = 3;
            //console.log('generating:' + monologuePrompt);
            console.log('textGen');
            let result: TextResponse|null = null;
            //while (!(result?.result) && retries > 0) {
                result = await this.generator.textGen({
                    prompt: monologuePrompt,
                    min_tokens: 50,
                    max_tokens: 200,
                    include_history: false,
                    template: '',
                    stop: [],
                    context_length: 2500
                });
            //    retries--;
            //}
            if (result) {
                console.log('result');
                console.log(result);
            } else {
                console.log('no result');
            }
            this.monologues[characterId] = result ? result.result : '';
        }
    }

    
    render(): ReactElement {
        return (<div></div>);
    }

}
