require("dotenv").config();
const http = require("http");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  MessageFlags,
} = require("discord.js");

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const COOLDOWN_MS = (Number(process.env.COOLDOWN_SECONDS) || 60) * 1000;
const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("ناقص TOKEN أو CLIENT_ID أو GUILD_ID في المتغيرات.");
  process.exit(1);
}

// ---------- تعريف الأمر ----------
const command = new SlashCommandBuilder()
  .setName("role")
  .setDescription("إعطاء أو إزالة رتبة من عضو")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("action")
      .setDescription("العملية")
      .setRequired(true)
      .addChoices(
        { name: "إعطاء رتبة", value: "give" },
        { name: "إزالة رتبة", value: "remove" }
      )
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("العضو").setRequired(true)
  )
  .addRoleOption((o) =>
    o.setName("role").setDescription("الرتبة").setRequired(true)
  );

// ---------- الحماية ----------
const cooldowns = new Map(); // userId -> وقت آخر استخدام
const busy = new Set(); // مستخدمين عندهم طلب شغال الحين

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: [command.toJSON()],
    });
    console.log(`البوت شغال: ${client.user.tag} وتم تسجيل الأمر /role`);
  } catch (err) {
    console.error("فشل تسجيل الأمر:", err);
  }
});

const reply = (i, content) =>
  i.editReply({ content, allowedMentions: { parse: [] } });

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "role") return;
  if (!interaction.inGuild() || interaction.guildId !== GUILD_ID) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;

  // منع تشغيل الأمر أكثر من مرة بنفس اللحظة
  if (busy.has(userId)) return reply(interaction, "⏳ عندك طلب شغال، انتظر ينتهي.");

  try {
    busy.add(userId);

    const guild = interaction.guild;
    const invoker = await guild.members.fetch(userId);

    // 1) الصلاحية
    const hasPerm =
      invoker.permissions.has(PermissionFlagsBits.ManageRoles) ||
      invoker.roles.cache.some((r) => ALLOWED_ROLE_IDS.includes(r.id));
    if (!hasPerm) return reply(interaction, "⛔ ما عندك صلاحية تستخدم هذا الأمر.");

    // 2) الكولداون (دقيقة افتراضياً)
    const last = cooldowns.get(userId) || 0;
    const left = COOLDOWN_MS - (Date.now() - last);
    if (left > 0) {
      return reply(interaction, `🕐 انتظر ${Math.ceil(left / 1000)} ثانية قبل الاستخدام التالي.`);
    }

    const action = interaction.options.getString("action", true);
    const targetUser = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);

    const me = await guild.members.fetchMe();
    const isOwner = guild.ownerId === userId;

    // 3) فحوصات الرتبة
    if (role.id === guild.id) return reply(interaction, "⛔ ما تقدر تتعامل مع رتبة @everyone.");
    if (role.managed) return reply(interaction, "⛔ هذي رتبة مرتبطة ببوت أو بوست ولا يمكن التحكم فيها.");
    if (me.roles.highest.position <= role.position)
      return reply(interaction, "⛔ رتبتي أقل من هذي الرتبة أو مساوية لها. ارفع رتبة البوت فوقها.");
    if (!isOwner && invoker.roles.highest.position <= role.position)
      return reply(interaction, "⛔ ما تقدر تتحكم برتبة أعلى من رتبتك أو مساوية لها.");
    if (!isOwner && role.permissions.has(PermissionFlagsBits.Administrator))
      return reply(interaction, "⛔ رتب الأدمن يتحكم فيها مالك السيرفر فقط.");

    // 4) فحوصات العضو
    if (targetUser.id === client.user.id)
      return reply(interaction, "⛔ ما تقدر تعدل رتب البوت نفسه.");

    let target;
    try {
      target = await guild.members.fetch(targetUser.id);
    } catch {
      return reply(interaction, "⛔ العضو مو موجود في السيرفر.");
    }
    if (target.id === guild.ownerId)
      return reply(interaction, "⛔ ما يمكن تعديل رتب مالك السيرفر.");
    if (me.roles.highest.position <= target.roles.highest.position)
      return reply(interaction, "⛔ هذا العضو رتبته أعلى من رتبة البوت أو مساوية لها.");
    if (!isOwner && target.id !== userId && invoker.roles.highest.position <= target.roles.highest.position)
      return reply(interaction, "⛔ ما تقدر تعدل عضو رتبته أعلى من رتبتك أو مساوية لها.");

    // 5) التنفيذ
    const reason = `بواسطة ${interaction.user.tag} (${userId}) عن طريق /role`;
    if (action === "give") {
      if (target.roles.cache.has(role.id))
        return reply(interaction, "ℹ️ العضو عنده هذي الرتبة أصلاً.");
      await target.roles.add(role.id, reason);
      cooldowns.set(userId, Date.now());
      return reply(interaction, `✅ تم إعطاء <@&${role.id}> للعضو <@${target.id}>.`);
    } else {
      if (!target.roles.cache.has(role.id))
        return reply(interaction, "ℹ️ العضو ما عنده هذي الرتبة.");
      await target.roles.remove(role.id, reason);
      cooldowns.set(userId, Date.now());
      return reply(interaction, `✅ تم إزالة <@&${role.id}> من العضو <@${target.id}>.`);
    }
  } catch (err) {
    console.error("خطأ في تنفيذ الأمر:", err);
    return reply(interaction, "❌ صار خطأ، تأكد من صلاحيات البوت وترتيب الرتب.");
  } finally {
    busy.delete(userId);
  }
});

// تنظيف الكولداون القديم
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of cooldowns) if (now - t > COOLDOWN_MS) cooldowns.delete(id);
}, 5 * 60 * 1000).unref();

// سيرفر صغير اختياري، بعض الاستضافات المجانية تحتاج منفذ مفتوح
if (process.env.PORT) {
  http
    .createServer((_, res) => res.end("ok"))
    .listen(process.env.PORT);
}

client.login(TOKEN);
