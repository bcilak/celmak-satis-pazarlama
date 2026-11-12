import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
const dataDir=mkdtempSync(join(tmpdir(),'celmak-orders-'));
const base='http://127.0.0.1:3197/api';
const server=spawn(process.execPath,['dist-server/index.js'],{env:{...process.env,DATA_DIR:dataDir,PORT:'3197'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
async function request(cookie,path,method='GET',body,expected=200){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 const result=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(result)}`);return result;
}
async function login(email){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Celmak!2026'})});assert.equal(r.status,200);return r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');}
try {
 for(let i=0;i<100&&!logs.includes('adresinde');i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(logs.includes('adresinde'),logs);
 const sales=await login('selin@celmak.com'),admin=await login('mehmet@celmak.com');
 const customer=await request(sales,'/customers','POST',{name:'Avans Test Cari',riskLimit:5000000},201);
 const customerId=customer.id;
 await request(admin,'/receipts','POST',{customerId,method:'BANK_TRANSFER',receiptDate:'2026-01-02',amount:2000000,currency:'TRY',exchangeRate:1,note:'2026 yıllık bağlantı avansı'},201);
 const balance=async()=> (await request(admin,`/customers/${customerId}/ledger`)).customer.balance;
 assert.equal(await balance(),-2000000);
 const part=await request(sales,'/products/parts','POST',{code:'TEST-PART',name:'Standart Test Parçası',partCategory:'STANDARD',unit:'Adet',unitPrice:100000,vatRate:20,stockQuantity:100},201);
 const products=await request(sales,'/products');assert.equal(products.find(x=>x.id===part.id).partCategory,'STANDARD');
 const assignees=await request(sales,'/approval-assignees');const manager=assignees.find(x=>x.email==='mehmet@celmak.com');
 // Fiyatlar KDV DAHİL gönderilir: 120.000 (KDV %20 dahil) → 100.000 + 20.000 KDV.
 const payload={customerId,orderKind:'SPARE_PART',advanceAmount:120000,paymentMethod:'TERM',paymentTermDays:30,downPayment:0,currency:'TRY',exchangeRate:1,approvalAssigneeId:manager.id,note:'Parça siparişi',items:[{productId:part.id,quantity:1,unitPrice:120000,vatRate:20}]};
 const sale=await request(sales,'/sales','POST',payload,201);
 assert.equal(sale.grandTotal,120000,'KDV fiyatın üzerine eklenmemeli');assert.equal(sale.subtotal,100000);assert.equal(sale.vatTotal,20000);
 await request(sales,'/sales','POST',{...payload,items:[{...payload.items[0],vatRate:18}]},400);
 await request(sales,`/sales/${sale.id}`,'PUT',{...payload,note:'Düzenlenen sipariş'});
 let detail=await request(admin,`/sales/${sale.id}/detail`);assert.equal(detail.sale.note,'Düzenlenen sipariş');assert.equal(detail.items.length,1);assert.equal(detail.schedule.length,0);
 await request(sales,`/sales/${sale.id}/submit`,'POST');
 await request(sales,`/sales/${sale.id}`,'PUT',payload,409);
 const approvalFor=async(id)=>(await request(admin,'/approvals')).find(a=>a.saleId===id&&a.status==='PENDING');
 let approval=await approvalFor(sale.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'REVISION_REQUESTED',reason:'Notu değiştirin'});
 await request(sales,`/sales/${sale.id}`,'PUT',{...payload,note:'Düzeltme tamamlandı'});
 await request(sales,`/sales/${sale.id}/submit`,'POST');approval=await approvalFor(sale.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal(await balance(),-1880000,'Avans yeniden tahsil edilmemeli');
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'},409);
 await request(sales,`/sales/${sale.id}`,'PUT',payload,409);
 const machine=products.find(x=>x.partCategory==='MACHINE');
 const mixed={...payload,orderKind:'MACHINE',advanceAmount:80000,paymentMethod:'CASH',downPayment:20000,items:[{productId:machine.id,quantity:1,unitPrice:110000,vatRate:10}]};
 const second=await request(sales,'/sales','POST',mixed,201);
 await request(sales,`/sales/${second.id}/submit`,'POST');approval=await approvalFor(second.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal(await balance(),-1800000,'Yeni peşinat ve kalan nakit yalnızca bir kez kaydedilmeli');
 const partial=await request(sales,'/sales','POST',{...payload,advanceAmount:60000,paymentSchedule:[{dueDate:'2026-12-01',amount:60000}]},201);
 detail=await request(admin,`/sales/${partial.id}/detail`);assert.equal(detail.schedule[0].amount,60000);
 await request(sales,'/sales','POST',{...payload,advanceAmount:2000000},400);
 await request(sales,'/sales','POST',{...payload,items:[mixed.items[0]]},400);
 await request(sales,'/sales','POST',{...payload,orderKind:'MACHINE'},400);
 // Two drafts can use the same available balance; the second must be rejected after the first consumes it.
 const large={...payload,advanceAmount:1200000,items:[{...payload.items[0],quantity:10}]};
 const a=await request(sales,'/sales','POST',large,201),b=await request(sales,'/sales','POST',large,201);
 for(const x of [a,b])await request(sales,`/sales/${x.id}/submit`,'POST');
 approval=await approvalFor(a.id);await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 approval=await approvalFor(b.id);await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'},409);
 assert.equal(await balance(),-600000);

 // Kredi kartı: onayda borç ve kart tahsilatı birlikte işlenir, bakiye değişmez; vade planı oluşmaz.
 const card=await request(sales,'/sales','POST',{...mixed,advanceAmount:0,downPayment:0,paymentMethod:'CREDIT_CARD',cardInstallments:3},201);
 await request(sales,`/sales/${card.id}/submit`,'POST');approval=await approvalFor(card.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal(await balance(),-600000,'Kart tahsilatı satış borcunu kapatmalı');
 detail=await request(admin,`/sales/${card.id}/detail`);assert.equal(detail.sale.paymentMethod,'CREDIT_CARD');assert.equal(detail.sale.cardInstallments,3);assert.equal(detail.schedule.length,0);
 assert.ok((await request(admin,`/customers/${customerId}/ledger`)).transactions.some(t=>t.transactionType==='CARD_RECEIPT'&&t.credit===110000));

 // İade: sevk edilmeden iade alınamaz; sevk edilen miktar kadar iade cariye alacak işler.
 const cardItem=detail.items[0];
 await request(admin,`/sales/${card.id}/returns`,'POST',{returnDate:'2026-11-10',reason:'Sevk yokken iade',items:[{saleItemId:cardItem.id,quantity:1}]},400);
 await request(admin,'/shipments','POST',{saleId:card.id,plannedDate:'2026-11-09',deliveryAddress:'Test depo adresi',items:[{saleItemId:cardItem.id,quantity:1}]},201);
 await request(sales,`/sales/${card.id}/returns`,'POST',{returnDate:'2026-11-10',reason:'Yetkisiz iade',items:[{saleItemId:cardItem.id,quantity:1}]},403);
 const saleReturn=await request(admin,`/sales/${card.id}/returns`,'POST',{returnDate:'2026-11-10',reason:'Hasarlı teslim',items:[{saleItemId:cardItem.id,quantity:1}]},201);
 assert.equal(saleReturn.grandTotal,110000);assert.equal(await balance(),-710000,'İade tutarı cariye alacak olarak işlenmeli');
 await request(admin,`/sales/${card.id}/returns`,'POST',{returnDate:'2026-11-10',reason:'İkinci iade',items:[{saleItemId:cardItem.id,quantity:1}]},400);
 detail=await request(admin,`/sales/${card.id}/detail`);assert.equal(detail.returns.length,1);assert.equal(detail.items[0].returnedQuantity,1);

 // Makine raporu: iade edilen adet net toplamdan düşer.
 const report=await request(sales,'/reports/machine-orders?from=2020-01-01&to=2099-12-31');
 const machineRow=report.rows.find(r=>r.customerId===customerId&&r.productId===machine.id);
 assert.equal(machineRow.quantity,2);assert.equal(machineRow.returnedQuantity,1);assert.equal(machineRow.shippedQuantity,1);

 // Cari notu: oluştururken ve sonradan düzenlenebilir, listede görünür.
 const noted=await request(sales,'/customers','POST',{name:'Notlu Bayi',tags:['DEALER'],note:'Ayın 15inde öder'},201);
 await request(sales,`/customers/${noted.id}/note`,'PUT',{note:'Depodan teslim alır'});
 assert.equal((await request(sales,'/customers')).find(c=>c.id===noted.id).note,'Depodan teslim alır');

 // Excel'den toplu cari: kayıtlı ad ve dosyadaki tekrar atlanır, adres/ilçe saklanır, tür Bayi olur.
 const imported=await request(sales,'/customers/import','POST',{tags:['DEALER'],paymentTermDays:30,rows:[
  {name:'MİRAY TARIM',city:'AFYON',district:'SİNANPAŞA',address:'ÖĞRETMEN MAH. CUMHURİYET CAD. NO:14',phone:'0542 338 26 30'},
  {name:'miray  tarım',city:'AFYON'},
  {name:'Notlu Bayi'},
  {name:'BALIKESİR PANCAR'},
 ]},201);
 assert.equal(imported.created.length,2);assert.deepEqual(imported.skipped.map(s=>s.reason),['Dosyada tekrar ediyor','Bu adla cari zaten kayıtlı']);
 const miray=(await request(sales,'/customers')).find(c=>c.name==='MİRAY TARIM');
 assert.equal(miray.district,'SİNANPAŞA');assert.equal(miray.address,'ÖĞRETMEN MAH. CUMHURİYET CAD. NO:14');assert.equal(miray.tags,'DEALER');assert.match(miray.code,/^MUS-\d{6}$/);
 await request(sales,'/customers/import','POST',{tags:['DEALER'],rows:[{name:'Uzun Telefon',phone:'1'.repeat(40)}]},400);

 // Cari güncelleme: bilgiler ve türler değişir, cari kodu sabit kalır.
 await request(sales,`/customers/${miray.id}`,'PUT',{name:'MİRAY TARIM LTD.',city:'AFYON',district:'SİNANPAŞA',address:'Yeni adres no:1',phone:'0542 000 00 00',paymentTermDays:45,riskLimit:250000,tags:['DEALER','CUSTOMER'],note:'Güncellendi'});
 const mirayAfter=(await request(sales,`/customers/${miray.id}`)).customer;
 assert.equal(mirayAfter.name,'MİRAY TARIM LTD.');assert.equal(mirayAfter.address,'Yeni adres no:1');assert.equal(mirayAfter.paymentTermDays,45);assert.equal(mirayAfter.riskLimit,250000);
 assert.equal(mirayAfter.code,miray.code);assert.deepEqual(mirayAfter.tags.split(',').sort(),['CUSTOMER','DEALER']);
 await request(sales,`/customers/${miray.id}`,'PUT',{name:'X',tags:['DEALER']},400);

 // Cari silme: yalnızca yönetici; açık bakiyeli cari silinemez; temiz cari listeden kalkar.
 await request(sales,`/customers/${miray.id}`,'DELETE',undefined,403);
 const blocked=await request(admin,`/customers/${customerId}`,'DELETE',undefined,409);
 assert.match(blocked.message,/bakiyesi var/);
 await request(admin,`/customers/${miray.id}`,'DELETE');
 assert.ok(!(await request(sales,'/customers')).some(c=>c.id===miray.id));
 await request(sales,`/customers/${miray.id}`,'GET',undefined,404);
 await request(admin,`/customers/${miray.id}`,'DELETE',undefined,404);
 // Silinen adla yeniden içe aktarma yapılabilir (yeni cari kodu alır).
 const reimported=await request(sales,'/customers/import','POST',{tags:['DEALER'],rows:[{name:'MİRAY TARIM LTD.'}]},201);
 assert.equal(reimported.created.length,1);assert.notEqual(reimported.created[0].code,miray.code);

 const checksCustomer=await request(sales,'/customers','POST',{name:'Çek Bağlantı Test Cari',riskLimit:5000000},201);
 const checksBalance=async()=> (await request(admin,`/customers/${checksCustomer.id}/ledger`)).customer.balance;
 const checks=[500000,500000,1000000,1000000].map((amount,i)=>({amount,issuer:'Test Keşideci',bankName:'Test Bankası',serialNumber:`BAG-${i}`,issueDate:'2026-10-01',dueDate:`2027-0${i+1}-15`}));
 const batch={requestId:crypto.randomUUID(),customerId:checksCustomer.id,targetAmount:2000000,currency:'TRY',exchangeRate:1,receivedDate:'2026-10-05',note:'2026 bağlantısı',checks};
 await request(sales,'/receipts/check-advances','POST',batch,403);
 const saved=await request(admin,'/receipts/check-advances','POST',batch,201);
 assert.equal(saved.total,3000000);assert.equal(await checksBalance(),-3000000);
 await request(admin,'/receipts/check-advances','POST',batch);assert.equal(await checksBalance(),-3000000,'Tekrar isteği çift kayıt yapmamalı');
 await request(admin,'/receipts/check-advances','POST',{...batch,note:'Değişen istek'},400);
 let history=await request(admin,`/receipts/check-advances?customerId=${checksCustomer.id}`);
 assert.equal(history.length,1);assert.equal(history[0].targetAmount,2000000);assert.equal(history[0].checks.length,4);
 assert.deepEqual(history[0].checks.map(c=>c.amount),[500000,500000,1000000,1000000]);
 // The first row is valid but the second is already recorded: rollback the entire group.
 await request(admin,'/receipts/check-advances','POST',{...batch,requestId:crypto.randomUUID(),checks:[{...checks[0],serialNumber:'ROLLBACK'},checks[0]]},400);
 assert.equal(await checksBalance(),-3000000);
 const inventory=await request(admin,'/instruments');assert.ok(!inventory.some(x=>x.serialNumber==='ROLLBACK'));
 await request(admin,'/receipts/check-advances','POST',{...batch,requestId:crypto.randomUUID(),checks:[{...checks[0],serialNumber:'BAD',amount:0}]},400);
 await request(admin,'/receipts/check-advances','POST',{...batch,requestId:crypto.randomUUID(),exchangeRate:2,checks:[{...checks[0],serialNumber:'BAD-RATE'}]},400);
 await request(admin,`/instruments/${history[0].checks[0].id}/movements`,'POST',{status:'COLLECTED',movementDate:'2027-01-15',exchangeRate:1});
 assert.equal(await checksBalance(),-3000000,'Çek tahsilatı ikinci kez avans yaratmamalı');
 await request(admin,`/instruments/${history[0].checks[1].id}/movements`,'POST',{status:'BOUNCED',movementDate:'2027-02-15'});
 assert.equal(await checksBalance(),-2500000,'Karşılıksız çek avansı azaltmalı');
 history=await request(admin,`/receipts/check-advances?customerId=${checksCustomer.id}`);
 assert.equal(history[0].checks[0].status,'COLLECTED');assert.equal(history[0].checks[1].status,'BOUNCED');
 console.log('PASS: eşit olmayan 4 çek, hedef/toplam farkı, grup kaydı, mükerrer/tekrar istek koruması, atomik geri alma, tahsilat ve karşılıksız çek bakiyesi');
 console.log('PASS: parça siparişi, düzenleme, revizyon, onay, 2 milyon avans, makine/parça mahsup, kısmi avans, mükerrer ve yetersiz bakiye kontrolleri');
 console.log('PASS: KDV dahil fiyat, 0/10/20 KDV kısıtı, kredi kartı tahsilatı, iade (sevk/yetki/miktar kontrolleri), makine raporu, cari notu, Excel ile toplu cari, cari düzenleme ve silme');
} finally {
 server.kill();await new Promise(r=>server.once('exit',r));
 assert.equal(dirname(resolve(dataDir)),resolve(tmpdir()));
 assert.ok(basename(dataDir).startsWith("celmak-orders-"));
 rmSync(dataDir,{recursive:true,force:true});
}
