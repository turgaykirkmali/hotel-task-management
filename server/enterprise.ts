import crypto from 'crypto';
import { pool } from './db';
import { convertToBase } from './inventoryUnits';
import { sendTelegramMessage } from './telegram';

const KEY = crypto.createHash('sha256').update(process.env.APP_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'hotel-ops-default-key').digest();

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}
function decrypt(value: string) {
  try {
    const [ivB64, tagB64, dataB64] = value.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

export async function initializeEnterpriseSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS integration_settings (id SERIAL PRIMARY KEY, hotel_id INTEGER REFERENCES hotels(id), channel TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE, settings TEXT NOT NULL DEFAULT '{}', created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, channel))`,
    `CREATE TABLE IF NOT EXISTS message_logs (id SERIAL PRIMARY KEY, hotel_id INTEGER REFERENCES hotels(id), user_id INTEGER REFERENCES users(id), channel TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT, template TEXT, status TEXT NOT NULL, provider_message_id TEXT, error TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS communication_consents (id SERIAL PRIMARY KEY, hotel_id INTEGER REFERENCES hotels(id), contact TEXT NOT NULL, channel TEXT NOT NULL, opted_in BOOLEAN NOT NULL DEFAULT FALSE, source TEXT, updated_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, contact, channel))`,
    `CREATE TABLE IF NOT EXISTS communication_suppressions (id SERIAL PRIMARY KEY, hotel_id INTEGER REFERENCES hotels(id), contact TEXT NOT NULL, channel TEXT NOT NULL, reason TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, contact, channel))`,
    `CREATE TABLE IF NOT EXISTS reviews (id SERIAL PRIMARY KEY, hotel_id INTEGER REFERENCES hotels(id), source TEXT NOT NULL, external_id TEXT, guest_name TEXT, score NUMERIC(5,2) NOT NULL, nps_score INTEGER, comment TEXT, stay_date DATE, review_date TIMESTAMP NOT NULL DEFAULT NOW(), response_status TEXT NOT NULL DEFAULT 'unresponded', sentiment TEXT, department TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, source, external_id))`,
    `CREATE TABLE IF NOT EXISTS inventory_stores (id SERIAL PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), name TEXT NOT NULL, code TEXT NOT NULL, storekeeper_user_id INTEGER REFERENCES users(id), active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, code))`,
    `CREATE TABLE IF NOT EXISTS inventory_items (id SERIAL PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), sku TEXT NOT NULL, name TEXT NOT NULL, category TEXT, unit TEXT NOT NULL DEFAULT 'adet', min_stock NUMERIC(14,3) NOT NULL DEFAULT 0, par_stock NUMERIC(14,3) NOT NULL DEFAULT 0, cost NUMERIC(14,4) NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, sku))`,
    `CREATE TABLE IF NOT EXISTS stock_transactions (id SERIAL PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), store_id INTEGER NOT NULL REFERENCES inventory_stores(id), item_id INTEGER NOT NULL REFERENCES inventory_items(id), type TEXT NOT NULL, quantity NUMERIC(14,3) NOT NULL, unit_cost NUMERIC(14,4), reference_type TEXT, reference_id INTEGER, note TEXT, user_id INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS barcode TEXT`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_url TEXT`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inventory_group TEXT`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS preferred_store_id INTEGER REFERENCES inventory_stores(id)`,
    `ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS document_no TEXT`,
    `ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS transaction_unit TEXT`,
    `ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS destination_store_id INTEGER REFERENCES inventory_stores(id)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_transactions_store_item ON stock_transactions(store_id,item_id,created_at)`,
    `CREATE TABLE IF NOT EXISTS inventory_requests (id SERIAL PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), request_no TEXT NOT NULL, requester_id INTEGER REFERENCES users(id), department TEXT, type TEXT NOT NULL DEFAULT 'issue', status TEXT NOT NULL DEFAULT 'pending', notes TEXT, source_store_id INTEGER REFERENCES inventory_stores(id), target_store_id INTEGER REFERENCES inventory_stores(id), approved_by INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT NOW(), approved_at TIMESTAMP, UNIQUE(hotel_id, request_no))`,
    `ALTER TABLE inventory_requests ADD COLUMN IF NOT EXISTS source_store_id INTEGER REFERENCES inventory_stores(id)`,
    `ALTER TABLE inventory_requests ADD COLUMN IF NOT EXISTS target_store_id INTEGER REFERENCES inventory_stores(id)`,
    `CREATE TABLE IF NOT EXISTS inventory_request_items (id SERIAL PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES inventory_requests(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES inventory_items(id), quantity NUMERIC(14,3) NOT NULL, unit TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS recipes (id SERIAL PRIMARY KEY, hotel_id INTEGER NOT NULL REFERENCES hotels(id), name TEXT NOT NULL, category TEXT, selling_price NUMERIC(14,2) NOT NULL DEFAULT 0, yield_qty NUMERIC(14,3) NOT NULL DEFAULT 1, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(hotel_id, name))`,
    `CREATE TABLE IF NOT EXISTS recipe_items (id SERIAL PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES inventory_items(id), quantity NUMERIC(14,3) NOT NULL, unit TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_message_logs_hotel_created ON message_logs(hotel_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_reviews_hotel_date ON reviews(hotel_id, review_date)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_transactions_hotel_item ON stock_transactions(hotel_id, item_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_inventory_requests_hotel_status ON inventory_requests(hotel_id, status)`,
  ];
  for (const statement of statements) await pool.query(statement);
  const hotels = (await pool.query('SELECT id FROM hotels')).rows;
  for (const h of hotels) {
    const legacy = (await pool.query(`SELECT id FROM inventory_stores WHERE hotel_id=$1 AND code='MAIN' LIMIT 1`, [h.id])).rows[0];
    const ana = (await pool.query(`SELECT id FROM inventory_stores WHERE hotel_id=$1 AND code='ANA' LIMIT 1`, [h.id])).rows[0];
    if (legacy && !ana) await pool.query(`UPDATE inventory_stores SET name='Ana Depo',code='ANA' WHERE id=$1`, [legacy.id]);
    if (legacy && ana) await pool.query(`UPDATE inventory_stores SET active=false,name='Legacy Main Store' WHERE id=$1`, [legacy.id]);
    const stores = [['Ana Depo','ANA'],['F&B Depo','FB'],['Mutfak Depo','MUTFAK'],['FO Depo','FO']];
    for (const [name, code] of stores) await pool.query(`INSERT INTO inventory_stores(hotel_id,name,code) VALUES($1,$2,$3) ON CONFLICT(hotel_id,code) DO NOTHING`, [h.id,name,code]);
  }
  console.log('Bootstrap: enterprise schema verified (integrations, reviews, inventory, recipes).');
}

export async function getIntegration(hotelId: number, channel: string) {
  const { rows } = await pool.query('SELECT * FROM integration_settings WHERE hotel_id=$1 AND channel=$2 LIMIT 1', [hotelId, channel]);
  if (!rows[0]) return null;
  const settings = JSON.parse(rows[0].settings || '{}');
  for (const key of Object.keys(settings)) if (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) settings[key] = decrypt(settings[key]);
  return { ...rows[0], settings };
}

export async function listIntegrations(hotelId: number) {
  const { rows } = await pool.query('SELECT * FROM integration_settings WHERE hotel_id=$1 ORDER BY channel', [hotelId]);
  return rows.map((r:any) => {
    const settings = JSON.parse(r.settings || '{}');
    for (const key of Object.keys(settings)) if (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) settings[key] = settings[key] ? '••••••••' : '';
    return { ...r, settings };
  });
}

export async function saveIntegration(hotelId: number, channel: string, enabled: boolean, input: Record<string, any>) {
  const current = await getIntegration(hotelId, channel);
  const settings: Record<string, any> = { ...(current?.settings || {}) };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value === '••••••••') continue;
    if (value !== '' && (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key.toLowerCase().includes('secret'))) settings[key] = encrypt(String(value));
    else settings[key] = value;
  }
  await pool.query(`INSERT INTO integration_settings(hotel_id,channel,enabled,settings,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(hotel_id,channel) DO UPDATE SET enabled=EXCLUDED.enabled,settings=EXCLUDED.settings,updated_at=NOW()`, [hotelId, channel, enabled, JSON.stringify(settings)]);
  return getIntegration(hotelId, channel);
}

async function isSuppressed(hotelId:number, contact:string, channel:string) {
  const { rows } = await pool.query('SELECT 1 FROM communication_suppressions WHERE hotel_id=$1 AND contact=$2 AND channel=$3 LIMIT 1', [hotelId, contact, channel]);
  return rows.length > 0;
}
async function hasConsent(hotelId:number, contact:string, channel:string) {
  const { rows } = await pool.query('SELECT opted_in FROM communication_consents WHERE hotel_id=$1 AND contact=$2 AND channel=$3 LIMIT 1', [hotelId, contact, channel]);
  return rows[0]?.opted_in === true;
}
export async function setConsent(hotelId:number, contact:string, channel:string, optedIn:boolean, source='manual') {
  await pool.query(`INSERT INTO communication_consents(hotel_id,contact,channel,opted_in,source,updated_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(hotel_id,contact,channel) DO UPDATE SET opted_in=EXCLUDED.opted_in,source=EXCLUDED.source,updated_at=NOW()`, [hotelId,contact,channel,optedIn,source]);
}

async function logMessage(hotelId:number, userId:number|undefined, channel:string, recipient:string, subject:string|undefined, template:string|undefined, status:string, providerMessageId?:string, error?:string) {
  await pool.query('INSERT INTO message_logs(hotel_id,user_id,channel,recipient,subject,template,status,provider_message_id,error) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [hotelId,userId||null,channel,recipient,subject||null,template||null,status,providerMessageId||null,error||null]);
}

export async function sendConfiguredEmail(hotelId:number, to:string, subject:string, html:string, userId?:number) {
  if (await isSuppressed(hotelId,to,'email')) return { ok:false, skipped:true, reason:'suppressed' };
  const integration = await getIntegration(hotelId,'email');
  const apiKey = integration?.settings?.apiKey || process.env.SENDGRID_API_KEY;
  const from = integration?.settings?.fromEmail || process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !from) return { ok:false, reason:'email_not_configured' };
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:from,name:integration?.settings?.fromName||'Hotel Operations'},subject,content:[{type:'text/html',value:html} ]})});
    const ok=response.ok; const text=ok?'':await response.text();
    await logMessage(hotelId,userId,'email',to,subject,'transactional',ok?'sent':'failed',undefined,text);
    return {ok,reason:text||undefined};
  } catch(e:any){ await logMessage(hotelId,userId,'email',to,subject,'transactional','failed',undefined,e.message); return {ok:false,reason:e.message}; }
}

async function twilioSend(hotelId:number, channel:'sms'|'whatsapp', to:string, body:string, userId?:number) {
  if (await isSuppressed(hotelId,to,channel)) return {ok:false,skipped:true,reason:'suppressed'};
  if ((channel==='sms'||channel==='whatsapp') && !(await hasConsent(hotelId,to,channel))) return {ok:false,skipped:true,reason:'no_opt_in'};
  const integration = await getIntegration(hotelId,channel);
  const sid=integration?.settings?.accountSid; const token=integration?.settings?.authToken; const from=integration?.settings?.from;
  if(!sid||!token||!from) return {ok:false,reason:'channel_not_configured'};
  try {
    const params = new URLSearchParams(); params.set('To', channel==='whatsapp' ? `whatsapp:${to.replace(/^whatsapp:/,'')}` : to); params.set('From', channel==='whatsapp' ? `whatsapp:${from.replace(/^whatsapp:/,'')}` : from);
    const templateSid=integration?.settings?.contentSid;
    if(channel==='whatsapp' && templateSid){ params.set('ContentSid',templateSid); params.set('ContentVariables',JSON.stringify({1:body})); }
    else params.set('Body',body);
    const auth=Buffer.from(`${sid}:${token}`).toString('base64');
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:params});
    const result:any=await response.json(); const ok=response.ok;
    await logMessage(hotelId,userId,channel,to,undefined,templateSid||'transactional',ok?'sent':'failed',result.sid,result.message||result.error_message);
    return {ok,providerMessageId:result.sid,reason:result.message||result.error_message};
  } catch(e:any){ await logMessage(hotelId,userId,channel,to,undefined,'transactional','failed',undefined,e.message); return {ok:false,reason:e.message}; }
}

export async function sendConfiguredSms(hotelId:number,to:string,body:string,userId?:number){return twilioSend(hotelId,'sms',to,body,userId)}
export async function sendConfiguredWhatsapp(hotelId:number,to:string,body:string,userId?:number){return twilioSend(hotelId,'whatsapp',to,body,userId)}

export async function sendConfiguredInstagram(hotelId:number, recipientId:string, message:string, userId?:number) {
  if (await isSuppressed(hotelId,recipientId,'instagram')) return {ok:false,skipped:true,reason:'suppressed'};
  if (!(await hasConsent(hotelId,recipientId,'instagram'))) return {ok:false,skipped:true,reason:'no_opt_in'};
  const integration=await getIntegration(hotelId,'instagram');
  const token=integration?.settings?.accessToken; const igUserId=integration?.settings?.instagramUserId; const version=integration?.settings?.graphVersion||'v23.0';
  if(!token||!igUserId) return {ok:false,reason:'instagram_not_configured'};
  try {
    const response=await fetch(`https://graph.facebook.com/${version}/${igUserId}/messages?access_token=${encodeURIComponent(token)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recipient:{id:recipientId},message:{text:message}})});
    const result:any=await response.json(); const ok=response.ok && !result.error;
    await logMessage(hotelId,userId,'instagram',recipientId,undefined,'transactional',ok?'sent':'failed',result.message_id,result.error?.message);
    return {ok,reason:result.error?.message,providerMessageId:result.message_id};
  } catch(e:any){await logMessage(hotelId,userId,'instagram',recipientId,undefined,'transactional','failed',undefined,e.message);return {ok:false,reason:e.message};}
}

export async function notifyPurchasingAndStorekeepers(hotelId:number, text:string) {
  const { rows } = await pool.query(`SELECT id,telegram_chat_id FROM users WHERE hotel_id=$1 AND telegram_chat_id IS NOT NULL AND (LOWER(COALESCE(department,'')) IN ('satınalma','satın alma','depo','depo / store','warehouse','purchasing') OR role IN ('admin','superadmin'))`,[hotelId]);
  for(const row of rows){ try{await sendTelegramMessage(Number(row.telegram_chat_id),text);}catch(e){console.error('Inventory Telegram notification error',e);} }
}

export async function getInventorySnapshot(hotelId:number, storeId?:number) {
  const params:any[]=[hotelId]; let storeFilter=''; if(storeId){params.push(storeId);storeFilter=` AND t.store_id=$${params.length}`;}
  const { rows }=await pool.query(`SELECT i.id,i.sku,i.name,i.category,i.image_url,i.unit,i.min_stock,i.par_stock,i.cost,COALESCE(SUM(t.quantity),0) AS stock FROM inventory_items i LEFT JOIN stock_transactions t ON t.item_id=i.id AND t.hotel_id=i.hotel_id ${storeFilter} WHERE i.hotel_id=$1 AND i.active=true GROUP BY i.id ORDER BY i.name`,params); return rows;
}

export async function consumeRecipe(hotelId:number, recipeId:number, yieldQty:number, userId?:number, storeId?:number) {
  const client=await pool.connect();
  try { await client.query('BEGIN');
    const recipe=(await client.query('SELECT * FROM recipes WHERE id=$1 AND hotel_id=$2',[recipeId,hotelId])).rows[0]; if(!recipe) throw new Error('Recipe not found');
    const store=storeId ? (await client.query('SELECT id FROM inventory_stores WHERE id=$1 AND hotel_id=$2',[storeId,hotelId])).rows[0] : (await client.query('SELECT id FROM inventory_stores WHERE hotel_id=$1 AND active=true ORDER BY id LIMIT 1',[hotelId])).rows[0]; if(!store) throw new Error('Active store not found');
    const items=(await client.query('SELECT * FROM recipe_items WHERE recipe_id=$1',[recipeId])).rows;
    for(const item of items){ const inv=(await client.query('SELECT unit FROM inventory_items WHERE id=$1 AND hotel_id=$2',[item.item_id,hotelId])).rows[0]; if(!inv) throw new Error('Reçete malzemesi bulunamadı'); const baseQty=convertToBase(Number(item.quantity), String(item.unit||inv.unit), String(inv.unit)); const qty=baseQty*Number(yieldQty)/Math.max(Number(recipe.yield_qty)||1,1); const balance=Number((await client.query('SELECT COALESCE(SUM(quantity),0) stock FROM stock_transactions WHERE hotel_id=$1 AND store_id=$2 AND item_id=$3',[hotelId,store.id,item.item_id])).rows[0].stock); if(balance<qty) throw new Error(`${item.item_id} için yetersiz stok. Mevcut: ${balance} ${inv.unit}`); await client.query(`INSERT INTO stock_transactions(hotel_id,store_id,item_id,type,quantity,transaction_unit,reference_type,reference_id,note,user_id) VALUES($1,$2,$3,'recipe_consumption',$4,$5,'recipe',$6,$7,$8)`,[hotelId,store.id,item.item_id,-qty,inv.unit,recipeId,`Recipe consumption: ${recipe.name}`,userId||null]); }
    await client.query('COMMIT'); return true;
  } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}

export async function dispatchConfiguredNotifications(hotelId:number, users:any[], subject:string, body:string, html?:string) {
  const results:any[]=[];
  const configs=await listIntegrations(hotelId);
  const enabled=new Set(configs.filter((x:any)=>x.enabled).map((x:any)=>x.channel));
  for(const user of users){
    if(enabled.has('email') && user.email){ results.push(await sendConfiguredEmail(hotelId,user.email,subject,html||`<p>${body.replace(/\n/g,'<br/>')}</p>`,user.id)); }
    const phone=user.phone;
    if(enabled.has('sms') && phone) results.push(await sendConfiguredSms(hotelId,phone,body,user.id));
    if(enabled.has('whatsapp') && phone) results.push(await sendConfiguredWhatsapp(hotelId,phone,body,user.id));
  }
  return results;
}
