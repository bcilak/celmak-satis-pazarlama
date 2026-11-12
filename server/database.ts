import { seedDemoSpareParts } from './demo-parts.ts'
import { machineCatalog } from './machine-catalog.ts'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, scryptSync } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Sunucuda kalıcı veri dizinini dışarıdan (DATA_DIR) alır; yerel
// geliştirmede proje içindeki data klasörü kullanılmaya devam eder.
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(root, 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(resolve(dataDir, 'celmak.db'))
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')

export function transaction<T>(work: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN','SALES','ACCOUNTING','SHIPPING','AUDITOR')),
      email TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,permission)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tax_number TEXT,
      phone TEXT,
      email TEXT,
      city TEXT,
      payment_term_days INTEGER NOT NULL DEFAULT 30,
      risk_limit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_tags (
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      tag TEXT NOT NULL CHECK(tag IN ('CUSTOMER','SUPPLIER','DEALER')),
      PRIMARY KEY(customer_id,tag)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      minimum_price REAL NOT NULL,
      vat_rate REAL NOT NULL,
      stock_quantity REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      created_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','REVISION_REQUESTED','REJECTED','APPROVED','COMPLETED','CANCELLED')),
      payment_method TEXT NOT NULL,
      payment_term_days INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      vat_total REAL NOT NULL,
      grand_total REAL NOT NULL,
      down_payment REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL CHECK(unit_price >= 0),
      vat_rate REAL NOT NULL,
      line_total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      requested_by INTEGER NOT NULL REFERENCES users(id),
      assigned_to INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','REVISION_REQUESTED')),
      reason TEXT,
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      correlation_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
    BEFORE UPDATE ON audit_logs BEGIN
      SELECT RAISE(ABORT, 'Denetim kayıtları değiştirilemez');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
    BEFORE DELETE ON audit_logs BEGIN
      SELECT RAISE(ABORT, 'Denetim kayıtları silinemez');
    END;

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exchange_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      currency TEXT NOT NULL CHECK(currency IN ('USD','EUR')),
      rate_date TEXT NOT NULL,
      rate REAL NOT NULL CHECK(rate > 0),
      source TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(currency, rate_date, source)
    );

    CREATE TABLE IF NOT EXISTS payment_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      sequence_no INTEGER NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('CASH','BANK_TRANSFER','CHECK','PROMISSORY_NOTE')),
      due_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      paid_amount REAL NOT NULL DEFAULT 0 CHECK(paid_amount >= 0),
      currency TEXT NOT NULL DEFAULT 'TRY',
      exchange_rate REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','INSTRUMENT_CREATED','PAID','CANCELLED')),
      UNIQUE(sale_id, sequence_no)
    );

    CREATE TABLE IF NOT EXISTS negotiable_instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      instrument_type TEXT NOT NULL CHECK(instrument_type IN ('CHECK','PROMISSORY_NOTE')),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sale_id INTEGER REFERENCES sales(id),
      payment_schedule_id INTEGER REFERENCES payment_schedules(id),
      issuer TEXT,
      bank_name TEXT,
      serial_number TEXT,
      issue_date TEXT,
      due_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'TRY',
      exchange_rate REAL NOT NULL DEFAULT 1,
      try_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PORTFOLIO','GIVEN_TO_BANK','COLLECTED','BOUNCED','PROTESTED','RETURNED','ENDORSED','ASSIGNED','CANCELLED')),
      current_holder TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS instrument_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_id INTEGER NOT NULL REFERENCES negotiable_instruments(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      counterparty TEXT,
      movement_date TEXT NOT NULL,
      exchange_rate REAL,
      note TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS e_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_type TEXT NOT NULL CHECK(document_type IN ('E_INVOICE','E_ARCHIVE','E_DISPATCH')),
      source_type TEXT NOT NULL CHECK(source_type IN ('SALE','SHIPMENT')),
      source_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      external_id TEXT,
      uuid TEXT,
      document_number TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_APPROVAL','QUEUED','SENT','COMPLETED','REJECTED','CANCELLED','ERROR')),
      error_code TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      completed_at TEXT,
      UNIQUE(document_type, source_type, source_id)
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      planned_date TEXT NOT NULL,
      actual_date TEXT,
      delivery_address TEXT NOT NULL,
      vehicle_plate TEXT,
      driver_name TEXT,
      dispatch_number TEXT,
      recipient_name TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','PREPARING','READY','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERED','CANCELLED')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL REFERENCES shipments(id),
      sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL CHECK(quantity > 0),
      UNIQUE(shipment_id, sale_item_id)
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      transaction_type TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      description TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'TRY',
      foreign_amount REAL NOT NULL DEFAULT 0,
      exchange_rate REAL NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      reversal_of_id INTEGER REFERENCES account_transactions(id),
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_type,source_id,transaction_type)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      sale_id INTEGER REFERENCES sales(id),
      payment_schedule_id INTEGER REFERENCES payment_schedules(id),
      method TEXT NOT NULL CHECK(method IN ('CASH','BANK_TRANSFER','CHECK','PROMISSORY_NOTE','REFUND')),
      receipt_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount>0),
      currency TEXT NOT NULL DEFAULT 'TRY',
      exchange_rate REAL NOT NULL DEFAULT 1,
      try_amount REAL NOT NULL,
      reference TEXT,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED','REVERSED')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS treasury_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_id INTEGER REFERENCES negotiable_instruments(id),
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('CHECK_COLLECTION','CHECK_DISCOUNT')),
      transaction_date TEXT NOT NULL,
      currency TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      bank_amount REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      commission_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      other_fee_amount REAL NOT NULL DEFAULT 0,
      counterparty TEXT,
      reference TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(instrument_id,transaction_type)
    );

    CREATE TABLE IF NOT EXISTS reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      statement_date TEXT NOT NULL,
      system_balance REAL NOT NULL,
      declared_balance REAL NOT NULL,
      difference REAL NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('MATCHED','DISPUTED','PENDING')),
      note TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      device_name TEXT,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delegations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      to_user_id INTEGER NOT NULL REFERENCES users(id),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'APPROVAL',
      active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS passkey_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      device_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      challenge TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('REGISTER','AUTHENTICATE')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.exec(`CREATE TABLE IF NOT EXISTS check_advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    target_amount REAL,
    total_amount REAL NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate REAL NOT NULL,
    received_date TEXT NOT NULL,
    note TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  addColumn('check_advances', 'request_hash', 'TEXT')
  addColumn('negotiable_instruments', 'check_advance_id', 'INTEGER REFERENCES check_advances(id)')

  addColumn('customers', 'code_source', "TEXT NOT NULL DEFAULT 'AUTO'")
  addColumn('customers', 'external_system', 'TEXT')
  addColumn('customers', 'external_id', 'TEXT')
  addColumn('products', 'inventory_source', "TEXT NOT NULL DEFAULT 'LOCAL'")
  addColumn('products', 'external_system', 'TEXT')
  addColumn('products', 'external_id', 'TEXT')
  addColumn('products', 'part_category', "TEXT NOT NULL DEFAULT 'MACHINE'")
  addColumn('products', 'product_group', 'TEXT')
  addColumn('products', 'product_subgroup', 'TEXT')
  addColumn('products', 'manufacturer_model', 'TEXT')
  addColumn('products', 'manual_price', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('products', 'stock_tracking', 'INTEGER NOT NULL DEFAULT 1')
  addColumn('products', 'catalog_source', 'TEXT')
  addColumn('sales', 'order_kind', "TEXT NOT NULL DEFAULT 'MACHINE'")
  addColumn('sales', 'advance_amount', 'REAL NOT NULL DEFAULT 0')
  addColumn('sales', 'currency', "TEXT NOT NULL DEFAULT 'TRY'")
  addColumn('sales', 'exchange_rate', 'REAL NOT NULL DEFAULT 1')
  addColumn('sales', 'exchange_rate_date', 'TEXT')
  addColumn('sales', 'instrument_type', 'TEXT')
  addColumn('sales', 'instrument_count', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('sales', 'first_due_date', 'TEXT')
  addColumn('sales', 'due_interval_days', 'INTEGER')
  addColumn('sales', 'term_installment_count', 'INTEGER NOT NULL DEFAULT 1')
  addColumn('sales', 'approval_assignee_id', 'INTEGER REFERENCES users(id)')
  addColumn('payment_schedules', 'paid_amount', 'REAL NOT NULL DEFAULT 0')
  addColumn('instrument_movements', 'discount_rate', 'REAL')
  addColumn('instrument_movements', 'fee_amount', 'REAL')
  addColumn('instrument_movements', 'net_amount', 'REAL')
  addColumn('instrument_movements', 'commission_amount', 'REAL')
  addColumn('instrument_movements', 'tax_amount', 'REAL')
  addColumn('instrument_movements', 'pricing_method', 'TEXT')
  addColumn('instrument_movements', 'annual_rate', 'REAL')
  addColumn('instrument_movements', 'days_to_maturity', 'INTEGER')
  addColumn('instrument_movements', 'with_recourse', 'INTEGER')
  addColumn('instrument_movements', 'movement_kind', 'TEXT')
  addColumn('instrument_movements', 'counterparty_customer_id', 'INTEGER REFERENCES customers(id)')
  addColumn('instrument_movements', 'settlement_amount', 'REAL')
  addColumn('instrument_movements', 'cash_amount', 'REAL NOT NULL DEFAULT 0')
  addColumn('instrument_movements', 'finance_cost', 'REAL NOT NULL DEFAULT 0')
  addColumn('instrument_movements', 'document_reference', 'TEXT')
  addColumn('users', 'password_hash', 'TEXT')
  addColumn('users', 'totp_secret', 'TEXT')
  addColumn('users', 'two_factor_enabled', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('users', 'password_changed_at', 'TEXT')
  addColumn('users', 'permissions_configured', 'INTEGER NOT NULL DEFAULT 0')
  addColumn('customers', 'note', 'TEXT')
  addColumn('customers', 'district', 'TEXT')
  addColumn('customers', 'address', 'TEXT')
  addColumn('sales', 'card_installments', 'INTEGER')

  // Sipariş iadeleri: sevk edilmiş ürünlerin geri alınması ve cariye alacak kaydı.
  db.exec(`CREATE TABLE IF NOT EXISTS sale_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    return_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    subtotal REAL NOT NULL,
    vat_total REAL NOT NULL,
    grand_total REAL NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate REAL NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS sale_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES sale_returns(id),
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL CHECK(quantity > 0),
    vat_rate REAL NOT NULL,
    line_net REAL NOT NULL,
    line_total REAL NOT NULL
  )`)
}

function addColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!columns.some(item => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

export function seed() {
  const count = Number((db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count)
  db.prepare("INSERT OR IGNORE INTO users (id,name,role,email,active) VALUES (5,'Ayşe Arslan','ADMIN','ayse@celmak.com',1)").run()
  db.prepare('INSERT OR IGNORE INTO system_settings (key,value) VALUES (?,?)').run('inventory.source', 'LOCAL')
  db.prepare('INSERT OR IGNORE INTO system_settings (key,value) VALUES (?,?)').run('customer.codeMode', 'AUTO')
  db.prepare('INSERT OR IGNORE INTO system_settings (key,value) VALUES (?,?)').run('edocument.provider', 'NOT_CONFIGURED')
  db.prepare('INSERT OR IGNORE INTO exchange_rates (currency,rate_date,rate,source) VALUES (?,?,?,?)').run('USD', '2026-08-24', 41.25, 'DEMO')
  db.prepare('INSERT OR IGNORE INTO exchange_rates (currency,rate_date,rate,source) VALUES (?,?,?,?)').run('EUR', '2026-08-24', 48.10, 'DEMO')
  db.prepare("UPDATE approvals SET assigned_to=5 WHERE status='PENDING' AND requested_by=assigned_to AND requested_by<>5").run()
  // Replace only the original demo catalog; preserve product IDs and order links.
  transaction(() => {
    const renameDemo = db.prepare("UPDATE products SET code=?,name=?,unit='Adet' WHERE code=? AND name=? AND inventory_source='LOCAL' AND part_category='MACHINE' AND NOT EXISTS (SELECT 1 FROM products WHERE code=?)")
    renameDemo.run('CLM-TMB-165', '165 Tamburlu Çayır Biçme Makinası', 'CLM-MTR-100', 'Endüstriyel Motor 100', 'CLM-TMB-165')
    renameDemo.run('CLM-SLJ-003', '3 Sıralı Silaj Makinası', 'CLM-PMP-220', 'Santrifüj Pompa 220', 'CLM-SLJ-003')
    renameDemo.run('CLM-KLT-001', 'Kültivatör', 'CLM-VLF-050', 'Paslanmaz Vana 50', 'CLM-KLT-001')
    renameDemo.run('CLM-RMK-001', 'Römork', 'CLM-SRV-001', 'Kurulum ve Devreye Alma', 'CLM-RMK-001')
  })
  transaction(() => seedMachineCatalog())
  transaction(() => seedDemoSpareParts(db))
  if (count > 0) { ensureSecurityAndLedger(); return }

  transaction(() => {
    const addUser = db.prepare('INSERT INTO users (id, name, role, email) VALUES (?, ?, ?, ?)')
    addUser.run(1, 'Selin Yılmaz', 'SALES', 'selin@celmak.com')
    addUser.run(2, 'Mehmet Kaya', 'ADMIN', 'mehmet@celmak.com')
    addUser.run(3, 'Zeynep Demir', 'ACCOUNTING', 'zeynep@celmak.com')
    addUser.run(4, 'Ali Çetin', 'SHIPPING', 'ali@celmak.com')

    const addCustomer = db.prepare(`INSERT INTO customers
      (code, name, tax_number, phone, email, city, payment_term_days, risk_limit, balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    addCustomer.run('MUS-000101', 'Atlas Makine A.Ş.', '1234567890', '0212 555 14 20', 'satinalma@atlas.com', 'İstanbul', 60, 1500000, 420000)
    addCustomer.run('MUS-000102', 'Nova Endüstri Ltd.', '9876543210', '0224 555 22 10', 'finans@nova.com', 'Bursa', 30, 750000, 185000)
    addCustomer.run('MUS-000103', 'Anadolu Pompa Sanayi', '4567891230', '0312 555 31 40', 'bilgi@anadolupompa.com', 'Ankara', 45, 900000, 0)

    const addProduct = db.prepare(`INSERT INTO products
      (code, name, unit, unit_price, minimum_price, vat_rate, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    addProduct.run('CLM-TMB-165', '165 Tamburlu Çayır Biçme Makinası', 'Adet', 52000, 48000, 20, 42)
    addProduct.run('CLM-SLJ-003', '3 Sıralı Silaj Makinası', 'Adet', 28500, 26000, 20, 68)
    addProduct.run('CLM-KLT-001', 'Kültivatör', 'Adet', 4750, 4200, 20, 240)
    addProduct.run('CLM-RMK-001', 'Römork', 'Adet', 18000, 15000, 20, 999)

  })
  ensureSecurityAndLedger()
}

function seedMachineCatalog() {
  // İlk demo ana mamulleri geçmiş siparişlerde korunur, yeni sipariş seçicisinde gösterilmez.
  db.prepare("UPDATE products SET active=0 WHERE code IN ('CLM-TMB-165','CLM-SLJ-003','CLM-KLT-001','CLM-RMK-001') AND catalog_source IS NULL").run()
  const upsert = db.prepare(`INSERT INTO products
    (code,name,unit,unit_price,minimum_price,vat_rate,stock_quantity,active,inventory_source,part_category,product_group,product_subgroup,manufacturer_model,manual_price,stock_tracking,catalog_source)
    VALUES (?,?, 'Adet',0,0,10,0,1,'LOCAL','MACHINE',?,?,?,1,0,'PRICE_LIST_2026_07_22')
    ON CONFLICT(code) DO UPDATE SET
      name=excluded.name,
      unit='Adet',
      vat_rate=10,
      active=1,
      part_category='MACHINE',
      product_group=excluded.product_group,
      product_subgroup=excluded.product_subgroup,
      manufacturer_model=excluded.manufacturer_model,
      manual_price=1,
      stock_tracking=0,
      catalog_source=excluded.catalog_source`)
  machineCatalog.forEach((item, index) => {
    const internalCode = `KAT-2026-${String(index + 1).padStart(4, '0')}`
    const isTrailer = item.group.includes('Römork')
    upsert.run(internalCode, item.name, isTrailer ? 'Römorklar' : item.group, isTrailer ? item.group : null, item.model ?? null)
  })
}

function ensureSecurityAndLedger(){
  const users=db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all() as {id:number}[]
  for(const user of users){const salt=randomBytes(16).toString('hex');const hash=scryptSync('Celmak!2026',salt,64).toString('hex');db.prepare("UPDATE users SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP WHERE id=?").run(`${salt}:${hash}`,user.id)}
  const ledgerCount=Number((db.prepare('SELECT COUNT(*) count FROM account_transactions').get() as {count:number}).count)
  if(ledgerCount===0)transaction(()=>{
    const customers=db.prepare('SELECT id,balance FROM customers').all() as {id:number;balance:number}[]
    const add=db.prepare(`INSERT INTO account_transactions (customer_id,transaction_type,transaction_date,description,debit,credit,currency,foreign_amount,exchange_rate,source_type,source_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    for(const c of customers)if(c.balance>0)add.run(c.id,'OPENING_BALANCE','2026-08-24','Açılış bakiyesi',c.balance,0,'TRY',c.balance,1,'OPENING',c.id,2)
    const sales=db.prepare("SELECT id,customer_id,number,grand_total,down_payment,currency,exchange_rate,created_by FROM sales WHERE status IN ('APPROVED','COMPLETED')").all() as {id:number;customer_id:number;number:string;grand_total:number;down_payment:number;currency:string;exchange_rate:number;created_by:number}[]
    for(const s of sales){const debit=s.grand_total*s.exchange_rate;add.run(s.customer_id,'SALE','2026-08-24',`${s.number} satış borcu`,debit,0,s.currency,s.grand_total,s.exchange_rate,'SALE',s.id,s.created_by);let credit=0;if(s.down_payment>0){credit=s.down_payment*s.exchange_rate;add.run(s.customer_id,'DOWN_PAYMENT','2026-08-24',`${s.number} peşinat`,0,credit,s.currency,s.down_payment,s.exchange_rate,'DOWN_PAYMENT',s.id,s.created_by)}db.prepare('UPDATE customers SET balance=balance+? WHERE id=?').run(debit-credit,s.customer_id)}
  })
}

export function audit(actorId: number, action: string, entityType: string, entityId: string | number, oldValue: unknown, newValue: unknown, ip: string | undefined, correlationId: string) {
  db.prepare(`INSERT INTO audit_logs
    (actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, correlation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(actorId, action, entityType, String(entityId), oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, ip ?? null, correlationId)
}
