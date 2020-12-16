/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable complexity */
import {Client, Emoji, GuildTextableChannel, Member, Message, MessageContent, MessageFile, PossiblyUncachedMessage} from "eris";
import mongoose, {Schema, model, Model, Document} from "mongoose";
import signale from "signale";
import {exec} from "child_process";
import {inspect} from "util";
import {default as fetch} from "node-fetch";

const config = require("../config.json");

signale.info("Something happened on the day he died");
signale.info("Spirit rose a meter and stepped aside");
signale.info("Somebody else took his place, and bravely cried");
signale.info("\"I'm a blackstar, I'm a blackstar\"");
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
            intents: ["guilds", "guildMessages", "guildMessageReactions"]
        });
        if(config.first){
            this.firstInit();
        }else{
            this.init();
        }
    }

    async firstInit(){
        this.db = await mongoose.connect(config.mongoLogin, {
            dbName: "blackstar",
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true
        });
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
            ignoredRoles: {type: Array, default: []},
            splitChannels: {type: Object, default: {}},
            removeOnUnreact: {type: Boolean, default: false},
            color: {type: Number, default: 16291859}
        });
        this.globalModel = model<Document & GlobalType>("global", globalSchema);

        const staredSchema = new Schema({
            message: {type: String, required: true, unique: true},
            count: {type: Number, default: 0},
            post: {type: String, index: true},
            channel: {type: String},
            removed: {type: Boolean, default: false},
            starredAt: {type: Number, default: 0}
        });
        this.starModel = model<Document & StarType>("star", staredSchema);
        this.globalModel.create({});
    }

    async init(): Promise<void> {
        this.db = await mongoose.connect(config.mongoLogin, {
            dbName: "blackstar",
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true
        });
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
            ignoredRoles: {type: Array, default: []},
            splitChannels: {type: Object, default: {}},
            removeOnUnreact: {type: Boolean, default: false},
            color: {type: Number, default: 16291859}
        });
        this.globalModel = model<Document & GlobalType>("global", globalSchema);

        const staredSchema = new Schema({
            message: {type: String, required: true, unique: true},
            count: {type: Number, default: 0},
            post: {type: String, index: true},
            channel: {type: String},
            removed: {type: Boolean, default: false},
            starredAt: {type: Number, default: 0}
        });
        this.starModel = model<Document & StarType>("star", staredSchema);
        
        const temp = await this.globalModel.findOne({}).exec();
        if(!temp){
            signale.fatal("Could not load global config");
            process.exit(0);
        }else{
            this.global = temp;
            this.global.thresholds ??= {};
            this.global.splitChannels ??= {};
            this.global.color ??= 16291859;
        }
        this.client.on("messageDelete", this.messageDelete.bind(this));
        this.client.on("messageReactionAdd", this.messageReactionAdd.bind(this));
        this.client.on("messageReactionRemove", this.messageReactionRemove.bind(this));
        this.client.on("messageCreate", this.messageCreate.bind(this));
        this.client.on("error", this.error.bind(this));
        this.client.once("ready", this.ready.bind(this));
        this.client.connect();
        this.client.editStatus("online", {type: 3, name: "the starboard"});
    }

    error(err: Error): void {
        signale.error(err.message);
    }

    ready(): void {
        signale.success("Blackstar Ready!");
    }

    formatPost(msg: Message, count: number, starredAt: number): MessageContent {
        const out: MessageContent = {content: `🌟 **${count}** | ${msg.channel.mention}` };
        out.embed = {
            author: {icon_url: msg.author.avatarURL, name: `${msg.author.username}#${msg.author.discriminator}`},
            timestamp: new Date(starredAt),
            color: this.global.color,
            footer: {text: "Message ID: " + msg.id},
            fields: [{name: "\u200b", value: `[Click to jump to message!](${msg.jumpLink})`}]
        };
        if(msg.content){
            out.embed.description = msg.content;
        }
        if(msg.attachments[0] || msg.embeds[0]){
            if(msg.attachments[0]){
                if(msg.attachments[0].url && (msg.attachments[0].url.endsWith(".png") || msg.attachments[0].url.endsWith(".jpg") || msg.attachments[0].url.endsWith(".jpeg") || msg.attachments[0].url.endsWith(".gif"))){
                    out.embed.image = {url: msg.attachments[0].url};
                }
            }else{
                if(msg.embeds[0]?.thumbnail?.url){
                    const temp = msg.embeds[0].thumbnail.url;
                    if(temp.endsWith(".png") || temp.endsWith(".jpeg") || temp.endsWith(".jpg") || temp.endsWith("gif")){
                        out.embed.image = {url: temp};
                    }
                }
            }
        }
        return out;
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
            this.starModel.deleteOne({message: msg.id}).exec();
        }
        const sbData = await this.starModel.findOne({post: msg.id}).exec();
        if(sbData){
            await this.starModel.updateOne({post: msg.id}, {removed: true, post: "", channel: ""});
        }
    }

    async messageReactionAdd(omsg: PossiblyUncachedMessage, emote: Emoji, user: Member | {id: string}): Promise<void> {
        if(user.id === this.client.user.id){return;}
        if(this.global.starChannel === ""){return;}
        
        const fullName = emote.id ? emote.animated ? `a:${emote.name}:${emote.id}` : `${emote.name}:${emote.id}` : emote.name;
        let toCheck;
        if(this.global.emote === undefined || this.global.emote === ""){
            toCheck = "⭐";
        }else{
            toCheck = this.global.emote;
        }
        if(fullName !== toCheck){return;}
        const guild = this.client.guilds.get((omsg.channel as GuildTextableChannel).guild.id)!;
        
        const channel = guild.channels.get(omsg.channel.id)! as GuildTextableChannel;
        let msg: Message;
        if(!(omsg as Message).author){
            const temp = await channel.getMessage(omsg.id).catch();
            if(!temp){return;}
            msg = temp;
        }else{
            msg = omsg as Message;
        }
        const sbData = await this.starModel.findOne({post: omsg.id}).exec();
        if(sbData?.post){
            sbData.count++;
            await this.starModel.updateOne({message: sbData.message}, sbData).exec();
            const newContent = `🌟 **${sbData.count}** | ` + msg.content.split(" | ")[1];
            msg.edit({content: newContent, embed: msg.embeds[0]}).catch(() => undefined);
            return;
        }
        if(this.global.ignoredChannels.includes(omsg.channel.id)){return;}
        if(msg.author.id === user.id){
            if(this.global.removeSelfStars){
                msg.removeReaction(fullName, user.id).catch(() => undefined);
            }
            return;
        }
        
        if(!(user instanceof Member)){
            const tuser = guild.members.get(user.id) ?? await guild.getRESTMember(user.id).catch(() => undefined);
            if(!tuser){return;}
            user = tuser;
            if((user as Member).bot){return;}
            if((user as Member).roles.length !== 0){
                if((user as Member).roles.some(r => this.global.ignoredRoles.includes(r))){return;}
            }
        }
        let data = await this.starModel.findOne({message: msg.id}).exec();
        if(!data){
            data = await this.starModel.create({message: msg.id, count: 1});
        }else{
            await this.starModel.updateOne({message: msg.id}, {$inc: {count: 1}}).exec();
            data.count++;
        }
        if(data.removed === true){return;}
        if(!data.post){
            const threshold = this.global.thresholds[channel.id] ?? this.global.defaultThreshold;
            if(data.count >= threshold){
                const destChannel = this.global.splitChannels[channel.id] ?? this.global.starChannel;
                const destChannelObj = guild.channels.get(destChannel);
                if(!destChannelObj || (!(destChannelObj.type === 0 || destChannelObj.type === 5))){return;}
                const starredAt = Date.now();
                let file: undefined | MessageFile = undefined;
                if(msg.attachments[0] && ![".png", ".gif", ".jpg", ".jpeg"].some(end => msg.attachments[0].url.endsWith(end))){
                    const data = await this.resolveFileAsBuffer(msg.attachments[0].url);
                    if(data){
                        file = {file: data, name: msg.attachments[0].filename};
                    }
                    
                }
                destChannelObj.createMessage(this.formatPost(msg, data.count, starredAt), file).then(async newmsg => {
                    newmsg.addReaction(this.global.emote ?? "⭐").catch(() => undefined);
                    await this.starModel.updateOne({message: msg.id}, {post: newmsg.id, channel: destChannel, starredAt}).exec();
                });
            }else{return;}
        }else{
            const threshold = this.global.thresholds[channel.id] ?? this.global.defaultThreshold;
            if(data.count >= threshold){
                const destChannel = guild.channels.get(data.channel!);
                if(!destChannel || (!(destChannel.type === 0 || destChannel.type === 5))){return;}
                const oldmsg = destChannel.messages.get(data.post) ?? await destChannel.getMessage(data.post).catch(() => undefined);
                if(!oldmsg){return;}
                oldmsg.edit(this.formatPost(msg, data.count, data.starredAt)).catch(() => undefined);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async resolveFileAsBuffer(resource: any){
        const file = await this.resolveFile(resource);
        if(!file){return;}
        if (Buffer.isBuffer(file)) return file;

        const buffers = [];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        for await (const data of file) buffers.push(data);
        return Buffer.concat((buffers as any));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async resolveFile(resource: any){
        if (/^https?:\/\//.test(resource)) {
            const res = await fetch(resource);
            return res.body;
        }else{
            return;
        }
    }

    async messageReactionRemove(omsg: PossiblyUncachedMessage, emote: Emoji, user: string) {
        if(user === this.client.user.id){return;}
        if(this.global.starChannel === ""){return;}
        
        const fullName = emote.id ? emote.animated ? `a:${emote.name}:${emote.id}` : `${emote.name}:${emote.id}` : emote.name;
        let toCheck;
        if(this.global.emote === undefined || this.global.emote === ""){
            toCheck = "⭐";
        }else{
            toCheck = this.global.emote;
        }
        if(fullName !== toCheck){return;}
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
        const sbData = await this.starModel.findOne({post: omsg.id}).exec();
        if(sbData?.post){
            sbData.count--;
            await this.starModel.updateOne({message: sbData.message}, sbData).exec();
            const newContent = `🌟 **${sbData.count}** | ` + msg.content.split(" | ")[1];
            msg.edit({content: newContent, embed: msg.embeds[0]}).catch(() => undefined);
            return;
        }
        if(this.global.ignoredChannels.includes(omsg.channel.id)){return;}
        if(msg.author.id === user){return;}
        const member = guild.members.get(user) ?? await guild.getRESTMember(user).catch(() => undefined);
        if(!member){return;}
        if(member.roles.length !== 0 && member.roles.some(r => this.global.ignoredRoles.includes(r))){return;}
        if(member.bot){return;}

        const data = await this.starModel.findOne({message: msg.id}).exec();
        if(!data){return;}
        if(data.removed === true){return;}
        data.count--;
        await this.starModel.updateOne({message: msg.id}, {$inc: {count: -1}}).exec();
        if(data.post){
            const threshold = this.global.thresholds[channel.id] ?? this.global.defaultThreshold;
            if(data.count >= threshold){
                const destChannel = guild.channels.get(data.channel!);
                if(!destChannel || (!(destChannel.type === 0 || destChannel.type === 5))){return;}
                const oldmsg = destChannel.messages.get(data.post) ?? await destChannel.getMessage(data.post).catch(() => undefined);
                if(!oldmsg){return;}
                oldmsg.edit(this.formatPost(msg, data.count, data.starredAt)).catch(() => undefined);
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

    async messageCreate(msg: Message<GuildTextableChannel>): Promise<void> {
        if(!(msg.member?.permissions.has("manageGuild") || msg.member?.roles.some(r => this.global.managerRoles.includes(r)) || msg.author.id === "253233185800847361" || msg.author.id === "254814547326533632")){return;}
        if(!msg.content.toLowerCase().startsWith("!star")){return;}
        const args = msg.content.split(" ").slice(1);
        const name = args.shift();
        if(!name){return;}
        const guild = msg.channel.guild;
        switch(name.toLowerCase()){
        case "ping": {
            const start = Date.now();
            msg.channel.createMessage("Ping?").then(x => {
                x.edit(`Pong! ${Date.now() - start}ms`);
            }).catch(() => undefined);
            break;
        }
        case "restart": {
            await msg.channel.createMessage("Restarting").catch(() => undefined);
            exec("pm2 restart blackstar");
            break;
        }
        case "help": {
            msg.channel.createMessage({embed: {
                title: "Blackstar Help",
                color: this.global.color,
                timestamp: new Date(),
                description: "Prefix: !star\n\nCommands:\n!star starchannel: sets the starboard channel\n!star defaultthreshold: sets the default star count needed\n!star splitchannel: sets split starboard channels\n!star threshold: sets channel specific thresholds\n!star managerroles: sets manager roles\n!star ignoredroles: sets star ignored roles\n!star ignoredchannels: sets ignored channels\n!star removeselfstars: sets if self star reaction are removed or just ignored\n!star removeonunreact: set if the starpost is delete if the count falls below the threshold\n!star color: changes the embed color"
            }}).catch(() => undefined);
            break;
        }
        case "managerroles": {
            if(!args[0]) {
                const list = this.global.managerRoles.length === 0 ? "None" : this.global.managerRoles.map(r => `<@&${r}>`).join("\n");
                msg.channel.createMessage({content: "Current manager roles:\n" + list, allowedMentions: {roles: false}}).catch(() => undefined);
                break;
            }
            const role = guild.roles.get(args[0]) ?? guild.roles.find(r => r.name.toLowerCase().startsWith(args[0].toLowerCase()));
            if(!role){
                msg.channel.createMessage("Please specify a valid role to add/remove as a manager role.").catch(() => undefined);
                break;
            }
            let rem = false;
            if(this.global.managerRoles.includes(role.id)){
                const ind = this.global.managerRoles.indexOf(role.id);
                this.global.managerRoles.splice(ind);
                rem = true;
            }else{
                this.global.managerRoles.push(role.id);
            }
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage((!rem ? "Added" : "Removed") + " " + role.name + " to manager roles").catch(() => undefined);
            break;
        }
        case "ignoredroles": {
            if(!args[0]) {
                const list = this.global.ignoredRoles.length === 0 ? "None" : this.global.ignoredRoles.map(r => `<@&${r}>`).join("\n");
                msg.channel.createMessage({content: "Current ignored roles:\n" + list, allowedMentions: {roles: false}}).catch(() => undefined);
                break;
            }
            const role = guild.roles.get(args[0]) ?? guild.roles.find(r => r.name.toLowerCase().startsWith(args[0].toLowerCase()));
            if(!role){
                msg.channel.createMessage("Please specify a role to add/remove as an ignored role.").catch(() => undefined);
                break;
            }
            let rem = false;
            if(this.global.ignoredRoles.includes(role.id)){
                const ind = this.global.ignoredRoles.indexOf(role.id);
                this.global.ignoredRoles.splice(ind);
                rem = true;
            }else{
                this.global.ignoredRoles.push(role.id);
            }
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage((!rem ? "Added" : "Removed") + " " + role.name + " from ignored roles").catch(() => undefined);
            break;
        }
        case "ignoredchannel": {
            if(!args[0]) {
                const list = this.global.ignoredChannels.length === 0 ? "None" : this.global.ignoredChannels.map(r => `<#${r}>`).join("\n");
                msg.channel.createMessage({content: "Current ignored channels:\n" + list}).catch(() => undefined);
                break;
            }
            const channel = guild.channels.get(args[0]) ?? guild.channels.find(c => (c.type === 0 || c.type === 5) && (c.mention === args[0] || c.name.toLowerCase().startsWith(args[0].toLowerCase())));
            if(!channel){
                msg.channel.createMessage("Please specify a channel to add/remove as an ignored channel.").catch(() => undefined);
                break;
            }
            let rem = false;
            if(this.global.ignoredChannels.includes(channel.id)){
                const ind = this.global.ignoredChannels.indexOf(channel.id);
                this.global.ignoredChannels.splice(ind);
                rem = true;
            }else{
                this.global.ignoredChannels.push(channel.id);
            }
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage(!rem ? "Added" : "Removed" + " " + channel.name + " from ignored channels").catch(() => undefined);
            break;
        }
        case "threshold": {
            if(!args[0]){
                const entries = Object.entries(this.global.thresholds);
                const list = entries.length === 0 ? "None" : entries.map(e => `<#${e[0]}> - ${e[1]}`).join("\n");
                msg.channel.createMessage("Current special thresholds:\n" + list).catch(() => undefined);
                break;
            }
            const channel = guild.channels.get(args[0]) ?? guild.channels.find(c => (c.type === 0 || c.type === 5) && (c.mention === args[0] || c.name.toLowerCase().startsWith(args[0].toLowerCase())));
            if(!channel){
                msg.channel.createMessage("Please specify a valid channel").catch(() => undefined);
                break;
            }
            if(!args[1]){
                if(!this.global.thresholds[channel.id]){
                    msg.channel.createMessage("No threshold was set for that channel, so there is none to reset").catch(() => undefined);
                    break;
                }
                delete this.global.thresholds[channel.id];
                await this.globalModel.updateOne({}, this.global).exec();
                msg.channel.createMessage("Reset threshold for " + channel.name + " to the default").catch(() => undefined);
                break;
            }else{
                const threshold = Number(args[1]);
                if(isNaN(threshold) || threshold < 3){
                    msg.channel.createMessage("Please provide a valid threshold of 3 or greater").catch(() => undefined);
                    break;
                }
                this.global.thresholds[channel.id] = threshold;
                await this.globalModel.updateOne({}, this.global).exec();
                msg.channel.createMessage("Set the threshold for " + channel.name + " to " + threshold.toString()).catch(() => undefined);
                break;
            }
        }
        case "removeselfstars": {
            if(!args[0]){
                if(this.global.removeSelfStars){
                    msg.channel.createMessage("Self stars are currently being removed").catch(() => undefined);
                }else{
                    msg.channel.createMessage("Self stars are not currently being removed").catch(() => undefined);
                }
                break;
            }
            const choice = this.input2boolean(args[0]);
            if(choice === undefined){
                msg.channel.createMessage("I didn't understand that choice, try `yes` or `no`").catch(() => undefined);
                break;
            }
            this.global.removeSelfStars = choice;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage(choice ? "Enabled" : "Disabled" + " remove self stars").catch(() => undefined);
            break;
        }
        case "removeonunreact": {
            if(!args[0]){
                if(this.global.removeOnUnreact){
                    msg.channel.createMessage("Unreacted posts are currently being removed").catch(() => undefined);
                }else{
                    msg.channel.createMessage("Unreacted posts are not currently being removed").catch(() => undefined);
                }
                break;
            }
            const choice = this.input2boolean(args[0]);
            if(choice === undefined){
                msg.channel.createMessage("I didn't understand that choice, try `yes` or `no`").catch(() => undefined);
                break;
            }
            this.global.removeOnUnreact = choice;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage(choice ? "Enabled" : "Disabled" + " remove posts on unreact").catch(() => undefined);
            break;
        }
        case "starchannel": {
            if(!args[0]){
                if(this.global.starChannel === ""){
                    msg.channel.createMessage("there is no starboard channel set").catch(() => undefined);
                }else{
                    const channel = guild.channels.get(this.global.starChannel)!;
                    msg.channel.createMessage("The starboard channel is " + channel.mention).catch(() => undefined);
                }
                break;
            }
            const channel = guild.channels.get(args[0]) ?? guild.channels.find(c => (c.type === 0 || c.type === 5) && (c.mention === args[0] || c.name.toLowerCase().startsWith(args[0].toLowerCase())));
            if(!channel){
                msg.channel.createMessage("Please specify a valid channel").catch(() => undefined);
                break;
            }
            this.global.starChannel = channel.id;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage("Set the default starboard channel to " + channel.mention).catch(() => undefined);
            break;
        }
        case "splitchannel": {
            if(!args[0]){
                const entries = Object.entries(this.global.splitChannels);
                const list = entries.length === 0 ? "None" : entries.map(e => `<#${e[0]}> - <#${e[1]}>`).join("\n");
                msg.channel.createMessage("Current split starboards:\n" + list).catch(() => undefined);
                break;
            }
            const targetChannel = guild.channels.get(args[0]) ?? guild.channels.find(c => (c.type === 0 || c.type === 5) && (c.mention === args[0] || c.name.toLowerCase().startsWith(args[0].toLowerCase())));
            if(!targetChannel){
                msg.channel.createMessage("Please specify a valid channel").catch(() => undefined);
                break;
            }
            if(!args[1]){
                if(!this.global.splitChannels[targetChannel.id]){
                    msg.channel.createMessage("there is no split starboard channel set for this channel").catch(() => undefined);
                }else{
                    const channel = guild.channels.get(this.global.starChannel)!;
                    msg.channel.createMessage("The starboard channel for  " + targetChannel.mention + " is " + channel.mention).catch(() => undefined);
                }
                break;
            }
            if(args[1] === "remove" && this.global.splitChannels[targetChannel.id]){
                delete this.global.splitChannels[targetChannel.id];
                await this.globalModel.updateOne({}, this.global).exec();
                msg.channel.createMessage("Removed split starboard for " + targetChannel.mention).catch(() => undefined);
                break;
            }
            const channel = guild.channels.get(args[0]) ?? guild.channels.find(c => (c.type === 0 || c.type === 5) && (c.mention === args[0] || c.name.toLowerCase().startsWith(args[0].toLowerCase())));
            if(!channel){
                msg.channel.createMessage("Please specify a valid channel to add as a split starboard").catch(() => undefined);
                break;
            }
            this.global.splitChannels[targetChannel.id] = channel.id;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage("Set the split starboard channel for " + targetChannel.mention + " to " + channel.name).catch(() => undefined);
            break;
        }
        case "defaultthreshold": {
            if(!args[0]){
                msg.channel.createMessage("The current default threshold is " + this.global.defaultThreshold.toString()).catch(() => undefined);
                break;
            }
            const threshold = Number(args[0]);
            if(isNaN(threshold) || threshold < 3){
                msg.channel.createMessage("Please provide a valid threshold of 3 or greater").catch(() => undefined);
                break;
            }
            this.global.defaultThreshold = threshold;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage("Set the default threshold to " + threshold.toString()).catch(() => undefined);
            break;
        }
        case "e":
        case "eval": {
            if(msg.author.id !== "253233185800847361"){break;}
            const code = args.join(" ");
            let evaled = await eval(code);
            if(typeof evaled !== "string"){
                evaled = inspect(evaled, {depth: 0});
            }
            if(evaled.length > 1900){evaled = (evaled as string).substring(0, 1990) + "...";}
            msg.channel.createMessage({
                embed: {
                    description: "```xl\n" + evaled + "```",
                    timestamp: new Date,
                    color: 6658041,
                    title: "Eval results"
                }
            }).catch(() => undefined);
            break;
        }
        case "color": {
            if(!args[0]){
                msg.channel.createMessage(`The current embed color is #${this.global.color.toString(16)}`).catch(() => undefined);
                break;
            }
            const newColor = parseInt((args[0].startsWith("#") ? args[0].substr(1) : args[0]), 16);
            if(isNaN(newColor) || newColor < 0 || newColor > 16777215){
                msg.channel.createMessage("Please give a valid hex color").catch(() => undefined);
                break;
            }
            this.global.color = newColor;
            await this.globalModel.updateOne({}, this.global).exec();
            msg.channel.createMessage("Changed embed color to #" + newColor.toString(16)).catch(() => undefined);
            break;
        }
        default: {return;}
        }
    }

    input2boolean(input: string): boolean | undefined {
        if(!input || input === ""){return;}
        input = input.toLowerCase();
        if(input === "yes" || input === "true"){return true;}
        if(input === "no" || input === "false"){return false;}
        return;
    }
}

interface GlobalType {
    managerRoles: Array<string>;//
    starChannel: string;//
    ignoredChannels: Array<string>;//
    defaultThreshold: number;//
    emote?: string;
    thresholds: {[key: string]: number};//
    removeSelfStars: boolean;//
    ignoredRoles: Array<string>;//
    splitChannels: {[key: string]: string};//
    removeOnUnreact: boolean;//
    color: number;
}

interface StarType {
    message: string;
    count: number;
    post?: string;
    channel?: string;
    removed: boolean;
    starredAt: number;
}

new Bot();