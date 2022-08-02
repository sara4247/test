const express = require("express");
const app = express();
const Discord = require("discord.js");
const mongoose = require("mongoose");
const fetch = require("node-fetch");
const formData = require("form-data");
const config = require("./config");
const client = new Discord.Client({
  intents: ["GUILDS", "GUILD_MEMBERS", "GUILD_MESSAGES"]
});
const db = require("./data");
const prefix = config.PREFIX;
const devs = config.DEVS;

mongoose.connect(config.DATABASE);
client.on("ready", () => {
  console.log(client.user.tag + " Working.");
});
client.login(config.TOKEN).catch(() => console.log("Invalid Token Was Provided.\nPlease put the TOKEN in secret"));

app.get("/", (req, res) => {
  if(!client.user) return res.redirect("/");
  let link = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(`${config.API_URL}/login`)}&response_type=code&scope=identify%20guilds.join`;
  res.send(`<a href="${link}">Login</a>`);
});

app.get("/login", async (req, res) => {
  if(!client.user) return res.redirect("/login");
  let link = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(`${config.API_URL}/login`)}&response_type=code&scope=identify%20guilds.join`;
  let code = req.query.code;
  if(!code) return res.redirect(link);
  let scope = "identify guilds.join";
  let body_data = new formData();
  body_data.append('client_id', config.CLIENT_ID);
  body_data.append('client_secret', config.CLIENT_SECRET);
  body_data.append('grant_type', 'authorization_code')
  body_data.append('code', code)
  body_data.append('redirect_uri', config.API_URL + "/login")
  body_data.append('scope', scope);
  let request_data = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: body_data
  }).catch(err => 0);
  if(!request_data) return res.redirect(link);
  request_data = await request_data.json();
  if(!request_data || !request_data.access_token) return res.redirect(link);
  let profile_data = await getProfile(request_data.token_type, request_data.access_token);
  if(!profile_data) return res.redirect(link);
  let data = await db.findOne({
    id: profile_data.id
  });
  if(!data) {
    data = await db.create({
      id: profile_data.id
    });
  }
  data.access_token = request_data.access_token,
  data.refresh_token = request_data.refresh_token;
  await data.save();
  let guild = client.guilds.cache.get(config.GUILD_ID);
  if(guild) {
    let member = await guild.members.fetch(profile_data.id).catch(() => null);
    if(member) {
      member.roles.add(config.ROLE_ID).catch(() => 0);
    }
  }
  res.redirect("/success");
});
app.get("/success", (req, res) => {
  res.sendFile(process.cwd() + "/success.html");
});
app.listen(() => console.log("Express Server Started."));

client.on("messageCreate", async message => {
  if(!message.guild || message.author.bot) return;
  let args = message.content.split(" ");
  if(!devs.find(d => d == message.author.id)) return;
  if(args[0] === prefix + "refresh") {
    let datas = await db.find();
    if(!datas || datas.length < 1) return message.reply({ content: `❌ No one login yet.` });
    message.reply({ content: `Refreshing ${datas.length} members...` }).then(async msg => {
      let available = 0;
      let unavailable = 0;
      datas.forEach(async d => {
        let dd = await refresh(d.refresh_token);
        if(!dd || !dd.access_token) {
          await db.findOneAndDelete({
            id: d.id
          }).catch(() => 0);
          unavailable += 1;
          return;
        }
        let data = await db.findOne({
          id: d.id
        });
        if(!data) {
          data = await db.create({
            id: d.id
          });
        }
        data.access_token = dd.access_token;
        data.refresh_token = dd.refresh_token;
        await data.save();
        available += 1;
        if((unavailable + available) >= datas.length) {
          msg.edit({ content: `**✅ Done refreshing ${datas.length} Members Successfully.\nAvailable: ${available}\nUnavailable: ${unavailable}**` }).catch(() => 0);
        }
      });
    });
  } else if(args[0] === prefix + "join") {
    let datas = await db.find();
    if(!datas || datas.length < 1) return message.reply({ content: `❌ No one login yet.` });
    let members = await message.guild.members.fetch();
    let detas = datas.filter(d => !members.find(m => m.user.id == d.id));
    if(detas.length < 1) return message.reply({ content: `❌ All of members in the data joined this server already.` });
    message.reply({ content: `${detas.length} members joining...` }).then(async msg => {
      let available = 0;
      let unavailable = 0;
      detas.forEach(async d => {
        let dd = await join(d, message.guild.id);
        if(!dd) {
          unavailable += 1;
          return;
        }
        available += 1;
        if((unavailable + available) >= detas.length) {
          msg.edit({ content: `**✅ Done join ${detas.length} Members Successfully.\nAvailable: ${available}\nUnavailable: ${unavailable}\nUse \`${prefix}refresh\` to clear unavailable members.**` }).catch(() => 0);
        }
      });
    });
  } else if(args[0] === prefix + "total") {
    let data = await db.find();
    message.reply({ content: `**Total Members in database is ${data ? data.length : 0}**` });
  } else if(args[0] === prefix + "send") {
    let msg = `
لـحماية السيرفر في حالة التهكير او الاغلاق من قبل الديسكورد

  لـ تسجيل الدخول يرجي الضغط علي الزر ادناه   
 Authorization 

 هذه العملية لا تقوم بسحب توكن الحساب او الباسوورد , الموضوع امن جداً وموجود في معظم البوتات اللي لها مواقع
`;
    let link = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&redirect_uri=${encodeURIComponent(`${config.API_URL}/login`)}&response_type=code&scope=identify%20guilds.join`;
    let btn = new Discord.MessageButton()
      .setStyle("LINK")
      .setURL(link)
      .setLabel("Authorization");
    let row = new Discord.MessageActionRow()
      .addComponents(btn);
    message.channel.send({ content: msg, components: [row] }).catch(() => 0);
  }
});

async function getProfile(token_type, access_token) {
  let data = await fetch("https://discord.com/api/users/@me", {
    headers: {
      authorization: `${token_type} ${access_token}`,
    }
  }).catch(err => 0);
  if(!data) return null;
  data = await data.json();
  return data;
}

async function refresh(refresh_token) {
  let scope = "identify guilds.join";
  let body_data = new formData();
  body_data.append('client_id', config.CLIENT_ID);
  body_data.append('client_secret', config.CLIENT_SECRET);
  body_data.append('grant_type', 'refresh_token');
  body_data.append('refresh_token', refresh_token);
  body_data.append('redirect_uri', config.API_URL + "/login");
  body_data.append('scope', scope);
  let data = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: body_data
  }).catch((err) => console.log(err));
  if(!data) return null;
  data = await data.json();
  return data;
}

async function join(user, guildId) {
  let gg = await client.api.guilds[guildId].members[user.id].put({
    data: {
      access_token: user.access_token
    }
  }).catch(err => console.log(err));
  if(gg) {
    return true;
  } else {
    return false;
  }
}