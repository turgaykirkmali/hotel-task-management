/**
 * Telegram API entegrasyonu
 * Telegraf.js kütüphanesi ile Telegram Bot API'sine bağlanıyor
 */
import { Telegraf } from 'telegraf';
import { storage } from './storage';

// Telegram Bot durumu
type TelegramStatus = 'initializing' | 'authenticated' | 'ready' | 'disconnected' | 'error';
let telegramStatus: TelegramStatus = 'initializing';
let telegramBot: Telegraf | null = null;

// Mesaj geçmişi ve kullanıcı-chat eşleştirmeleri için saklama alanı
interface UserChatMapping {
  userId: number;
  telegramChatId: number;
  telegramUsername: string;
  lastActive: Date;
}

// Kullanıcı eşleştirme deposu
let userChatMappings: UserChatMapping[] = [];

// Mesaj geçmişi
let messageLog: {chatId: number, message: string, timestamp: Date}[] = [];

// Request güncellendiğinde çağrılacak callback (WebSocket broadcast için)
let requestUpdateCallback: ((requestId: number, hotelId: number) => void) | null = null;

/**
 * WebSocket broadcast callback'ini kaydet (routes.ts'den çağrılır)
 */
export function setRequestUpdateCallback(fn: (requestId: number, hotelId: number) => void): void {
  requestUpdateCallback = fn;
}

// Bot için mesajlar
const WELCOME_MESSAGE = 'Merhaba! 👋 Otel Talep Yönetim Sistemi botuna hoş geldiniz. Lütfen "/connect KULLANICI_KODUNUZ" yazarak sistemdeki hesabınızla bağlantı kurun.';
const HELP_MESSAGE = 'Kullanılabilir komutlar:\n/connect KULLANICI_KODUNUZ - Sistemdeki hesabınızla bağlantı kurun\n/status - Bot durumunu kontrol edin\n/help - Bu yardım mesajını görüntüleyin';

/**
 * Telegram Bot'u başlatır
 */
export async function initializeTelegram(): Promise<boolean> {
  try {
    console.log("Telegram servisi başlatılıyor...");
    telegramStatus = 'initializing';
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error("TELEGRAM_BOT_TOKEN çevre değişkeni bulunamadı. Telegram bildirimleri devre dışı.");
      telegramStatus = 'error';
      return false;
    }
    
    console.log("Telegram token bulundu, bot oluşturuluyor...");
    telegramBot = new Telegraf(botToken);
    
    console.log("Telegram bot komutları tanımlanıyor...");
    
    telegramBot.start((ctx) => {
      console.log(`Start komutu alındı: ${ctx.chat.id}`);
      ctx.reply(WELCOME_MESSAGE);
    });
    
    telegramBot.help((ctx) => {
      ctx.reply(HELP_MESSAGE);
    });
    
    telegramBot.command('status', (ctx) => {
      ctx.reply(`Bot durumu: ${telegramStatus}`);
    });
    
    // Kullanıcı bağlantı komutu
    telegramBot.command('connect', async (ctx) => {
      const message = ctx.message.text.split(' ');
      if (message.length < 2) {
        return ctx.reply('Lütfen kullanıcı kodunuzu girin. Örnek: /connect KULLANICI_KODUNUZ');
      }
      
      const userCode = message[1].toLowerCase().replace('@', '');
      const chatId = ctx.chat.id;
      
      console.log(`Bağlantı isteği: ${chatId}, Kod: ${userCode}`);
      
      // DB'de kullanıcıyı ara: önce username, sonra telegramUsername ile
      let dbUser = await storage.getUserByUsername(userCode);
      if (!dbUser) {
        dbUser = await storage.getUserByTelegramUsername(userCode) ||
                 await storage.getUserByTelegramUsername('@' + userCode);
      }
      
      // DB'de bulunan kullanıcının telegramUsername'ini standartlaştır
      // Böylece bildirim gönderirken username uyuşmazlığı olmaz
      let canonicalUsername = userCode;
      let canonicalUserId: number | null = null;
      if (dbUser) {
        canonicalUserId = dbUser.id;
        if (dbUser.telegramUsername) {
          canonicalUsername = dbUser.telegramUsername.replace('@', '').toLowerCase();
        }
        console.log(`DB kullanıcısı bulundu: ${dbUser.username} (id:${dbUser.id}), Telegram: ${canonicalUsername}`);
      }
      
      const chatMapping = userChatMappings.find(m => m.telegramChatId === chatId);
      
      if (chatMapping) {
        chatMapping.telegramUsername = canonicalUsername;
        chatMapping.lastActive = new Date();
        if (canonicalUserId) chatMapping.userId = canonicalUserId;
        return ctx.reply(`Bağlantı güncellendi! '${dbUser?.firstName || userCode}' hesabına ait görev bildirimleri bu sohbete gönderilecek.`);
      }
      
      const userId = canonicalUserId ?? Math.floor(1000 + Math.random() * 9000);
      userChatMappings.push({ userId, telegramChatId: chatId, telegramUsername: canonicalUsername, lastActive: new Date() });
      
      console.log(`Yeni eşleştirme eklendi: ChatID=${chatId}, UserID=${userId}, Username=${canonicalUsername}`);
      const displayName = dbUser ? `${dbUser.firstName} ${dbUser.lastName}` : userCode;
      ctx.reply(`✅ Bağlantı başarılı! Merhaba *${displayName}* — görev bildirimleri artık bu sohbete gelecek.`, { parse_mode: 'Markdown' });
    });

    // =============================================
    // INLINE BUTON CALLBACK HANDLER'LARI
    // =============================================

    // Yardımcı: chatId'den DB'deki gerçek kullanıcıyı bul
    async function resolveDbUser(chatId: number) {
      const mapping = userChatMappings.find(m => m.telegramChatId === chatId);
      if (!mapping) return null;
      // Önce telegramUsername ile DB'de ara
      const dbUser = await storage.getUserByTelegramUsername(mapping.telegramUsername);
      if (dbUser) return dbUser;
      // DB'de bulunamazsa mapping'deki userId ile dene (sadece 1 gibi gerçek ID'ler için)
      if (mapping.userId < 1000) {
        return storage.getUser(mapping.userId);
      }
      return null;
    }

    // "Ata" butonu — otel personel listesini göster
    telegramBot.action(/^assign_(\d+)$/, async (ctx) => {
      try {
        const requestId = parseInt(ctx.match[1]);
        
        const request = await storage.getRequestById(requestId);
        if (!request) {
          await ctx.answerCbQuery('❌ Talep bulunamadı.');
          return;
        }
        
        if (request.status === 'tamamlandı') {
          await ctx.answerCbQuery('⚠️ Bu talep zaten tamamlandı.');
          return;
        }
        
        // Oteldeki tüm personeli getir
        const hotelUsers = await storage.getUsersByHotelId(request.hotelId);
        if (!hotelUsers || hotelUsers.length === 0) {
          await ctx.answerCbQuery('❌ Bu otelde kayıtlı personel bulunamadı.');
          return;
        }
        
        // Her personel için bir buton oluştur (max 8 kişi göster)
        const userButtons = hotelUsers.slice(0, 8).map(u => ([{
          text: `👤 ${u.firstName} ${u.lastName} (${u.role === 'admin' ? 'Yönetici' : 'Personel'})`,
          callback_data: `assignto_${u.id}_${requestId}`
        }]));
        
        await ctx.answerCbQuery('👥 Personel listesi açılıyor...');
        await ctx.reply(
          `👥 *Kime Atansın?*\n\n` +
          `📍 Oda: ${request.roomNumber}\n` +
          `📝 Talep: ${request.request}\n\n` +
          `Lütfen atamak istediğiniz personeli seçin:`,
          {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: userButtons }
          }
        );
      } catch (err) {
        console.error('Telegram assign callback hatası:', err);
        await ctx.answerCbQuery('❌ Bir hata oluştu.');
      }
    });

    // "Personel seç" butonu — seçilen kişiye ata
    telegramBot.action(/^assignto_(\d+)_(\d+)$/, async (ctx) => {
      try {
        const targetUserId = parseInt(ctx.match[1]);
        const requestId = parseInt(ctx.match[2]);
        
        const request = await storage.getRequestById(requestId);
        if (!request) {
          await ctx.answerCbQuery('❌ Talep bulunamadı.');
          return;
        }
        
        const targetUser = await storage.getUser(targetUserId);
        if (!targetUser) {
          await ctx.answerCbQuery('❌ Kullanıcı bulunamadı.');
          return;
        }
        
        await storage.assignRequestToUser(requestId, targetUserId);
        
        const userName = `${targetUser.firstName} ${targetUser.lastName}`;
        await ctx.answerCbQuery(`✅ ${userName} kişisine atandı!`);
        
        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(
            `✅ *Talep Atandı*\n\n` +
            `📍 *Oda:* ${request.roomNumber}\n` +
            `👤 *Atanan:* ${userName}\n` +
            `📌 *Durum:* İşlemde`,
            { parse_mode: 'Markdown' }
          );
        } catch (_) {}
        
        // Atanan kişiye Telegram bildirimi gönder
        if (targetUser.telegramUsername) {
          try {
            await sendTaskAssignmentNotification(
              targetUser.telegramUsername,
              request.roomNumber,
              request.request,
              request.department,
              request.deadline ? new Date(request.deadline) : undefined,
              requestId
            );
            console.log(`[Telegram] Atama bildirimi → ${targetUser.telegramUsername}`);
          } catch (notifErr) {
            console.error('[Telegram] Atama bildirimi gönderilemedi:', notifErr);
          }
        }
        
        if (requestUpdateCallback) requestUpdateCallback(requestId, request.hotelId);
        console.log(`[Telegram] Talep #${requestId} → ${userName} (id:${targetUserId}) atandı.`);
      } catch (err) {
        console.error('Telegram assignto callback hatası:', err);
        await ctx.answerCbQuery('❌ Bir hata oluştu.');
      }
    });

    // "İşleme Al" butonu
    telegramBot.action(/^inprogress_(\d+)$/, async (ctx) => {
      try {
        const requestId = parseInt(ctx.match[1]);
        const chatId = ctx.callbackQuery.from.id;
        
        const dbUser = await resolveDbUser(chatId);
        if (!dbUser) {
          await ctx.answerCbQuery('❌ Hesabınız sistemde bulunamadı. /connect komutu ile bağlanın.');
          return;
        }
        
        const request = await storage.getRequestById(requestId);
        if (!request) {
          await ctx.answerCbQuery('❌ Talep bulunamadı.');
          return;
        }
        
        if (request.status === 'tamamlandı') {
          await ctx.answerCbQuery('⚠️ Bu talep zaten tamamlandı.');
          return;
        }
        
        // Durumu "işlemde" yap (completedById yok — FK ihlali olmaz)
        await storage.updateRequestStatus(requestId, 'işlemde', null);
        
        // Atanmamışsa kendine ata
        if (!request.assignedToId) {
          await storage.assignRequestToUser(requestId, dbUser.id);
        }
        
        await ctx.answerCbQuery('▶️ Talep işleme alındı!');
        
        try {
          await ctx.editMessageReplyMarkup({
            inline_keyboard: [[
              { text: '✅ Tamamla', callback_data: `complete_${requestId}` }
            ]]
          });
        } catch (_) {}
        
        if (requestUpdateCallback) requestUpdateCallback(requestId, request.hotelId);
        console.log(`[Telegram] Talep #${requestId} işleme alındı (${dbUser.username})`);
      } catch (err) {
        console.error('Telegram inprogress callback hatası:', err);
        await ctx.answerCbQuery('❌ Bir hata oluştu.');
      }
    });

    // "Tamamla" butonu
    telegramBot.action(/^complete_(\d+)$/, async (ctx) => {
      try {
        const requestId = parseInt(ctx.match[1]);
        const chatId = ctx.callbackQuery.from.id;
        
        const dbUser = await resolveDbUser(chatId);
        if (!dbUser) {
          await ctx.answerCbQuery('❌ Hesabınız sistemde bulunamadı. /connect komutu ile bağlanın.');
          return;
        }
        
        const request = await storage.getRequestById(requestId);
        if (!request) {
          await ctx.answerCbQuery('❌ Talep bulunamadı.');
          return;
        }
        
        if (request.status === 'tamamlandı') {
          await ctx.answerCbQuery('⚠️ Bu talep zaten tamamlandı.');
          return;
        }
        
        await storage.updateRequestStatus(requestId, 'tamamlandı', new Date(), dbUser.id);
        
        await ctx.answerCbQuery('✅ Talep tamamlandı!');
        
        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
          await ctx.reply(
            `✅ *Talep Tamamlandı*\n\n` +
            `📍 *Oda:* ${request.roomNumber}\n` +
            `🔧 *Talep:* ${request.request}\n` +
            `👤 *Tamamlayan:* ${dbUser.firstName} ${dbUser.lastName}\n` +
            `📌 *Durum:* Tamamlandı ✅`,
            { parse_mode: 'Markdown' }
          );
        } catch (_) {}
        
        if (requestUpdateCallback) requestUpdateCallback(requestId, request.hotelId);
        console.log(`[Telegram] Talep #${requestId} tamamlandı (${dbUser.username})`);
      } catch (err) {
        console.error('Telegram complete callback hatası:', err);
        await ctx.answerCbQuery('❌ Bir hata oluştu.');
      }
    });
    
    // Text mesajları için catch-all handler
    telegramBot.on('text', (ctx) => {
      const chatId = ctx.chat.id;
      const messageText = ctx.message.text;
      
      const existingMapping = userChatMappings.find(m => m.telegramChatId === chatId);
      if (!existingMapping) {
        ctx.reply(`Henüz bağlı değilsiniz. Lütfen "/connect KULLANICI_KODUNUZ" komutunu kullanarak bağlanın.`);
        return;
      }
      
      ctx.reply('Mesajınız alındı. Talepleri yönetmek için gelen bildirimdeki butonları kullanabilirsiniz.');
    });
    
    // Hata işleme
    telegramBot.catch((err: any, ctx: any) => {
      console.error(`Telegram bot hatası: ${err}`);
    });
    
    // Kullanıcı eşleştirmelerini LAUNCH'DAN ÖNCE doldur
    // (telegramBot.launch() hiç resolve olmayan bir Promise olduğu için
    //  await edilirse altındaki kod asla çalışmaz)
    userChatMappings = [];
    
    userChatMappings.push({
      userId: 1,
      telegramChatId: 12345678,
      telegramUsername: 'test_user',
      lastActive: new Date()
    });
    
    userChatMappings.push({
      userId: 25,
      telegramChatId: 6065420180,
      telegramUsername: 'turgaykirkmali',
      lastActive: new Date()
    });
    
    userChatMappings.push({
      userId: 20,
      telegramChatId: 7146312544,
      telegramUsername: 'gulcankirkmali',
      lastActive: new Date()
    });
    
    console.log('Aktif kullanıcı eşleştirmeleri:', userChatMappings);
    
    console.log("Telegram bot başlatılıyor...");
    
    // launch() await edilmez — Promise hiç resolve olmaz (bot durduğunda resolve eder)
    telegramBot.launch()
      .then(() => console.log('Telegram botu durduruldu.'))
      .catch((launchError: any) => {
        console.error('Telegram bot başlatılamadı, simülasyon moduna geçiliyor:', launchError);
      });
    
    telegramStatus = 'ready';
    console.log('Telegram botu başarıyla başlatıldı!');
    
    process.once('SIGINT', () => telegramBot?.stop('SIGINT'));
    process.once('SIGTERM', () => telegramBot?.stop('SIGTERM'));
    
    return true;
  } catch (error) {
    console.error('Telegram servisi başlatılamadı:', error);
    telegramStatus = 'error';
    return false;
  }
}

/**
 * Telegram chatId'ye düz mesaj gönderir
 */
export async function sendTelegramMessage(chatId: number, message: string): Promise<boolean> {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return false;
    
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
    });
    const result = await response.json() as any;
    
    if (result.ok) {
      messageLog.push({ chatId, message, timestamp: new Date() });
      return true;
    } else {
      console.error(`❌ Telegram API hatası: ${result.description}`);
      return false;
    }
  } catch (error) {
    console.error('Telegram mesajı gönderilirken hata:', error);
    return false;
  }
}

/**
 * Görev bildirimi — inline butonlarla gönderir (Ata / İşleme Al / Tamamla)
 */
export async function sendTaskAssignmentNotification(
  telegramUsername: string,
  roomNumber: string,
  requestDetails: string,
  department: string,
  deadline?: Date,
  requestId?: number
): Promise<boolean> {
  try {
    const deadlineText = deadline
      ? `\n🕒 *Tamamlanma Zamanı:* ${deadline.toLocaleString('tr-TR')}`
      : '';

    const message =
      `🏨 *Yeni Görev Ataması*\n\n` +
      `📍 *Oda:* ${roomNumber}\n` +
      `🔧 *Talep:* ${requestDetails}\n` +
      `🏢 *Departman:* ${department}` +
      deadlineText + `\n\n` +
      `Lütfen bu görevi mümkün olan en kısa sürede tamamlayın.`;

    // Chat ID'yi bul
    const cleanUsername = telegramUsername.replace('@', '').toLowerCase();
    const userMapping = userChatMappings.find(
      m => m.telegramUsername.toLowerCase() === cleanUsername
    );

    const chatId = userMapping?.telegramChatId || null;

    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) {
      console.log(`[Telegram] ChatID bulunamadı veya token yok: ${telegramUsername}`);
      // Log only
      messageLog.push({ chatId: 0, message: `SİMÜLASYON → ${telegramUsername}: ${message}`, timestamp: new Date() });
      return false;
    }

    // Inline keyboard oluştur (sadece requestId varsa buton ekle)
    let replyMarkup: any = {};
    if (requestId) {
      replyMarkup = {
        inline_keyboard: [[
          { text: '👤 Ata', callback_data: `assign_${requestId}` },
          { text: '▶️ İşleme Al', callback_data: `inprogress_${requestId}` },
          { text: '✅ Tamamla', callback_data: `complete_${requestId}` }
        ]]
      };
    }

    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const body: any = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    };
    if (requestId) {
      body.reply_markup = replyMarkup;
    }

    console.log(`[Telegram] Mesaj gönderiliyor → ChatID: ${chatId} (${telegramUsername})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json() as any;

    if (result.ok) {
      console.log(`✅ Telegram bildirimi gönderildi: ${chatId}`);
      messageLog.push({ chatId, message, timestamp: new Date() });
      return true;
    } else {
      console.error(`❌ Telegram API hatası: ${result.description}`);
      return false;
    }
  } catch (error) {
    console.error('Görev atama bildirimi gönderilirken hata:', error);
    return false;
  }
}

/**
 * Telegram kullanıcı adıyla düz mesaj gönderir (geriye dönük uyumluluk)
 */
export async function sendTelegramByUsername(telegramUsername: string, message: string): Promise<boolean> {
  const cleanUsername = telegramUsername.replace('@', '').toLowerCase();
  const userMapping = userChatMappings.find(m => m.telegramUsername.toLowerCase() === cleanUsername);
  
  if (!userMapping) {
    console.log(`[Telegram] Kullanıcı bulunamadı: ${telegramUsername}`);
    messageLog.push({ chatId: 0, message: `SİMÜLASYON: ${telegramUsername} => ${message}`, timestamp: new Date() });
    return false;
  }
  
  return sendTelegramMessage(userMapping.telegramChatId, message);
}

/**
 * Telegram Bot'unun mevcut durumunu döndürür
 */
export function getTelegramStatus(): TelegramStatus {
  return telegramStatus;
}

/**
 * Telegram Bot'unun hazır olup olmadığını kontrol eder
 */
export function isTelegramReady(): boolean {
  return telegramStatus === 'ready';
}

/**
 * Kullanıcı-Telegram bağlantısı ekler
 */
export function addTelegramUserMapping(userId: number, chatId: number, telegramUsername: string): void {
  const existing = userChatMappings.find(
    m => m.userId === userId || m.telegramChatId === chatId || m.telegramUsername === telegramUsername
  );
  
  if (existing) {
    existing.userId = userId;
    existing.telegramChatId = chatId;
    existing.telegramUsername = telegramUsername.replace('@', '');
    existing.lastActive = new Date();
  } else {
    userChatMappings.push({
      userId,
      telegramChatId: chatId,
      telegramUsername: telegramUsername.replace('@', ''),
      lastActive: new Date()
    });
  }
  
  console.log(`Telegram kullanıcı eşleştirmesi eklendi: ${userId} => ${chatId} (${telegramUsername})`);
}
