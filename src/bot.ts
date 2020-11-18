import {Client, Emoji, GuildTextableChannel, Member, Message, PossiblyUncachedMessage} from "eris";
import mongoose, {Schema, model, Model, Document} from "mongoose";
import signale from "signale";

const config = require("../config.json");


class Bot {
    client: Client;
    db!: typeof mongoose;
    globalModel!: Model<Document & GlobalType>;
    starModel!: Model<Document & StarType>;
    global!: GlobalType;
    constructor(){
        this.client = new Client(config.token, {
            defaultImageFormat: "png",
            defaultImageSize: 4096,
            intents: ["guildMessages", "guildMessageReactions"]
        });
        this.init();
    }

    async init(): Promise<void> {
        this.db = await mongoose.connect(config.mongoLogin);
        mongoose.connection.on("open", () => signale.success("Connected to mongoDB!"));
        mongoose.connection.on("error", () => signale.error("Failed to connect to mongoDB!"));

        const globalSchema = new Schema({
            managerRoles: {type: Array, default: []},
            thresholds: {type: Object, default: {}},
            starChannel: {type: String, default: ""},
            ignoredChannels: {type: Array, default: []},
            defaultThreshold: {type: Number, default: 10},
            emote: {type: String},
            removeSelfStars: {type: Boolean, default: true},
            ignoredRole: {type: String, default: ""},
            splitChannels: {type: Object, default: {}},
            removeOnUnreact: {type: Boolean, default: false}
        });
        this.globalModel = model<Document & GlobalType>("global", globalSchema);

        const staredSchema = new Schema({
            message: {type: String, required: true, unique: true},
            count: {type: Number, default: 0},
            post: {type: String},
            channel: {type: String}
        });
        this.starModel = model<Document & StarType>("star", staredSchema);
        
        const temp = await this.globalModel.findOne({}).exec();
        if(!temp){
            signale.fatal("Could not load global config");
            process.exit(0);
        }else{
            this.global = temp;
        }
        this.client.on("messageDelete", this.messageDelete.bind(this));
    }


    async messageDelete(msg: PossiblyUncachedMessage): Promise<void> {
        const data = await this.starModel.findOne({message: msg.id}).exec();
        const guild = this.client.guilds.get((msg.channel as GuildTextableChannel).guild.id)!;
        if(data){
            if(data.post){
                const channel = guild.channels.get(data.channel!) as undefined | GuildTextableChannel;
                if(channel){
                    const message = channel.messages.get(data.post) ?? await channel.getMessage(data.post).catch(() => undefined);
                    if(message){
                        message.delete().catch(() => undefined);
                    }
                }
            }
        }
    }

    // eslint-disable-next-line complexity
    async messageReactionAdd(omsg: PossiblyUncachedMessage, emote: Emoji, user: Member | {id: string}): Promise<void> {
        if(this.global.ignoredChannels.includes(omsg.channel.id)){return;}
        const fullName = emote.id ? emote.animated ? `a:${emote.name}:${emote.id}` : `${emote.name}:${emote.id}` : emote.name;
        if(fullName !== this.global.emote ?? "⭐"){return;}
        const guild = this.client.guilds.get((omsg.channel as GuildTextableChannel).guild.id)!;
        const channel = guild.channels.get(omsg.channel.id)! as GuildTextableChannel;
        let msg: Message;
        if(!(omsg as Message).author){
            const temp = await channel.getMessage(omsg.id).catch(() => undefined);
            if(!temp){return;}
            msg = temp;
        }else{
            msg = omsg as Message;
        }
        if(msg.author.id === user.id){
            if(this.global.removeSelfStars){
                msg.removeReaction(fullName, user.id).catch(() => undefined);
            }
            return;
        }

        let data = await this.starModel.findOne({message: msg.id}).exec();
        if(!data){
            data = await this.starModel.create({message: msg.id, count: 1});
        }else{
            this.starModel.updateOne({message: msg.id}, {$inc: {count: 1}}).exec();
            data.count++;
        }
        if(!data.post){
            const threshold = this.global.thresholds[channel.id] ?? this.global.defaultThreshold;
            if(data.count >= threshold){
                const destChannel = this.global.splitChannels[channel.id] ?? this.global.starChannel;
                const destChannelObj = guild.channels.get(destChannel);
                if(!destChannelObj || (!(destChannelObj.type === 0 || destChannelObj.type === 5))){return;}
                destChannelObj.createMessage("placeholder").then(newmsg => {
                    this.starModel.updateOne({message: msg.id}, {post: newmsg.id, channel: destChannel}).exec();
                });
            }else{return;}
        }else{
            const threshold = this.global.thresholds[channel.id] ?? this.global.defaultThreshold;
            if(data.count >= threshold){
                const destChannel = guild.channels.get(data.channel!);
                if(!destChannel || (!(destChannel.type === 0 || destChannel.type === 5))){return;}
                const oldmsg = destChannel.messages.get(data.post) ?? await destChannel.getMessage(data.post).catch(() => undefined);
                if(!oldmsg){return;}
                oldmsg.edit("placeholder").catch(() => undefined);
            }else{
                if(this.global.removeOnUnreact){
                    const destChannel = guild.channels.get(data.channel!);
                    if(!destChannel || (!(destChannel.type === 0 || destChannel.type === 5))){return;}
                    const oldmsg = destChannel.messages.get(data.post) ?? await destChannel.getMessage(data.post).catch(() => undefined);
                    if(!oldmsg){return;}
                    oldmsg.delete().catch(() => undefined);
                }
            }
        }
    }

    async messageReactionRemove(omsg: PossiblyUncachedMessage, emote: Emoji, user: string) {
        if(this.global.ignoredChannels.includes(omsg.channel.id)){return;}
        const fullName = emote.id ? emote.animated ? `a:${emote.name}:${emote.id}` : `${emote.name}:${emote.id}` : emote.name;
        if(fullName !== this.global.emote ?? "⭐"){return;}
        const guild = this.client.guilds.get((omsg.channel as GuildTextableChannel).guild.id)!;
        const channel = guild.channels.get(omsg.channel.id)! as GuildTextableChannel;
        let msg: Message;
        if(!(omsg as Message).author){
            const temp = await channel.getMessage(omsg.id).catch(() => undefined);
            if(!temp){return;}
            msg = temp;
        }else{
            msg = omsg as Message;
        }
        if(msg.author.id === user){return;}
    } 
}

interface GlobalType {
    managerRoles: Array<string>;
    starChannel: string;
    ignoredChannels: Array<string>;
    defaultThreshold: string;
    emote?: string;
    thresholds: {[key: string]: number};
    removeSelfStars: boolean;
    ignoredRole: string;
    splitChannels: {[key: string]: string},
    removeOnUnreact: boolean;
}

interface StarType {
    message: string;
    count: number;
    post?: string;
    channel?: string;
}