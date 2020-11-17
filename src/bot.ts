import {Client, GuildTextableChannel, PossiblyUncachedMessage} from "eris";
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
            slpitChannels: {type: Object, default: {}}
        });
        this.globalModel = model<Document & GlobalType>("global", globalSchema);

        const staredSchema = new Schema({
            message: {type: String, required: true, unique: true},
            removed: {type: Boolean, default: false},
            count: {type: Number, default: 0},
            post: {type: String},
            channel: {type: String}
        });
        this.starModel = model<Document & StarType>("star", staredSchema);
        
        const temp = await this.globalModel.findOne({}).exec();
        if(!temp){
            signale.fatal("Could not load global config");
        }
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
        this.starModel.updateOne({message: msg.id}, {removed: true}).exec();
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
    splitchannels: {[key: string]: string}
}

interface StarType {
    message: string;
    removed: boolean;
    count: number;
    post?: string;
    channel?: string;
}