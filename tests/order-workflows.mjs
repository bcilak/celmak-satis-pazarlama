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
 // Açılış bakiyesi (devir): borç ve avans işlenir, yeni cari açılır, aynı cariye ikinci devir girilmez.
 const balanceTarget=reimported.created[0];
 await request(sales,'/customers/opening-balances','POST',{date:'2026-01-01',rows:[{name:'X Bayi',amount:100}]},403);
 const opening=await request(admin,'/customers/opening-balances','POST',{date:'2026-01-01',tags:['DEALER'],rows:[
  {customerId:balanceTarget.id,name:'MİRAY TARIM LTD.',amount:276000,lastDate:'2022-08-26'},
  {name:'BEREKET TARIM',amount:-15580225.33,note:'ZAFER GÜNDAY'},
  {name:'SIFIR BAKİYE BAYİ',amount:0},
  {name:'bereket  tarım',amount:-100},
 ]},201);
 assert.equal(opening.created.length,2,'BEREKET TARIM (iki satır birleşir) ve sıfır bakiyeli bayi açılmalı');
 assert.equal(opening.posted.length,2);assert.equal(opening.totals.debit,276000);assert.equal(opening.totals.credit,15580325.33);
 let ledger=await request(admin,`/customers/${balanceTarget.id}/ledger`);
 assert.equal(ledger.customer.balance,276000);assert.ok(ledger.transactions.some(t=>t.transactionType==='OPENING_BALANCE'&&t.debit===276000&&/son işlem 26\.08\.2022/.test(t.description)));
 const bereket=(await request(admin,'/customers')).find(c=>c.name==='BEREKET TARIM');
 assert.equal(bereket.balance,-15580325.33,'Avans eksi bakiye olmalı');assert.equal(bereket.hasOpeningBalance,1);assert.equal(bereket.note,'ZAFER GÜNDAY');assert.equal(bereket.tags,'DEALER');
 const again=await request(admin,'/customers/opening-balances','POST',{date:'2026-01-01',rows:[{customerId:bereket.id,name:'BEREKET TARIM',amount:-5}]});
 assert.equal(again.posted.length,0);assert.match(again.skipped[0].reason,/daha önce/);
 assert.equal((await request(admin,`/customers/${bereket.id}/ledger`)).customer.balance,-15580325.33,'İkinci devir bakiyeyi değiştirmemeli');
 // Döviz: tutar kurla TL'ye çevrilir; TL'de kur 1 olmalı.
 await request(admin,'/customers/opening-balances','POST',{date:'2026-01-01',currency:'TRY',exchangeRate:2,rows:[{name:'Kur Test',amount:10}]},400);
 const eur=await request(admin,'/customers/opening-balances','POST',{date:'2026-01-01',currency:'EUR',exchangeRate:50,rows:[{name:'AGRIBAU SH. P.K.-KOSOVA',amount:30320}]},201);
 ledger=await request(admin,`/customers/${eur.created[0].id}/ledger`);
 assert.equal(ledger.customer.balance,1516000);assert.equal(ledger.transactions[0].currency,'EUR');assert.equal(ledger.transactions[0].foreignAmount,30320);

 // Kullanıcı yönetimi: oluşturma, ilk girişte zorunlu parola değişikliği, düzenleme, pasife alma.
 const loginAs=async(email,password,expected=200)=>{const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(r.status,expected,email);return {cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '),body:await r.json()};};
 const newUser={name:'Deniz Yeni',email:'Deniz.Yeni@Celmak.com',role:'SALES',password:'Gecici-Parola-1'};
 await request(sales,'/admin/users','POST',newUser,403);
 await request(admin,'/admin/users','POST',{...newUser,password:'kisa'},400);
 const createdUser=await request(admin,'/admin/users','POST',newUser,201);
 await request(admin,'/admin/users','POST',{...newUser,email:'deniz.yeni@celmak.com'},409);
 let deniz=await loginAs('deniz.yeni@celmak.com','Gecici-Parola-1');
 assert.equal(deniz.body.mustChangePassword,true,'Geçici parolayla ilk girişte değişiklik istenmeli');
 const blockedCall=await request(deniz.cookie,'/customers','GET',undefined,403);assert.equal(blockedCall.mustChangePassword,true);
 assert.equal((await request(deniz.cookie,'/session')).currentUser.mustChangePassword,1);
 await request(deniz.cookie,'/auth/change-password','POST',{currentPassword:'yanlis-parola',newPassword:'Benim-Parolam-2026'},400);
 await request(deniz.cookie,'/auth/change-password','POST',{currentPassword:'Gecici-Parola-1',newPassword:'Gecici-Parola-1'},400);
 await request(deniz.cookie,'/auth/change-password','POST',{currentPassword:'Gecici-Parola-1',newPassword:'Benim-Parolam-2026'});
 await request(deniz.cookie,'/customers');
 await loginAs('deniz.yeni@celmak.com','Gecici-Parola-1',401);
 // Düzenleme: ad/e-posta/rol değişir; rol değişince özel yetkiler sıfırlanır.
 await request(admin,`/admin/users/${createdUser.id}/permissions`,'PUT',{permissions:['DASHBOARD']});
 await request(admin,`/admin/users/${createdUser.id}`,'PUT',{name:'Deniz Yılmaz',email:'deniz@celmak.com',role:'ACCOUNTING',active:true});
 const managed=(await request(admin,'/admin/users')).users.find(u=>u.id===createdUser.id);
 assert.equal(managed.name,'Deniz Yılmaz');assert.equal(managed.email,'deniz@celmak.com');assert.equal(managed.role,'ACCOUNTING');assert.ok(managed.permissions.includes('RECEIPTS'),'Muhasebe varsayılan yetkileri gelmeli');
 await request(deniz.cookie,'/session','GET',undefined,401);
 deniz=await loginAs('deniz@celmak.com','Benim-Parolam-2026');
 // Pasife alma: oturum kapanır, giriş yapılamaz.
 await request(admin,`/admin/users/${createdUser.id}`,'PUT',{name:'Deniz Yılmaz',email:'deniz@celmak.com',role:'ACCOUNTING',active:false});
 await request(deniz.cookie,'/session','GET',undefined,401);
 await loginAs('deniz@celmak.com','Benim-Parolam-2026',401);
 // Yönetici kendini kilitleyemez.
 const me=(await request(admin,'/session')).currentUser;
 await request(admin,`/admin/users/${me.id}`,'PUT',{name:me.name,email:me.email,role:'ADMIN',active:false},409);
 await request(admin,`/admin/users/${me.id}`,'PUT',{name:me.name,email:me.email,role:'SALES',active:true},409);
 await request(admin,`/admin/users/${me.id}/password`,'POST',{password:'Baska-Parola-99'},409);
 // Geçici parola: yeniden etkinleştirilen kullanıcı yeni geçici parolayla girer ve değiştirmesi istenir.
 await request(admin,`/admin/users/${createdUser.id}`,'PUT',{name:'Deniz Yılmaz',email:'deniz@celmak.com',role:'ACCOUNTING',active:true});
 await request(admin,`/admin/users/${createdUser.id}/password`,'POST',{password:'Yeni-Gecici-77'});
 await loginAs('deniz@celmak.com','Benim-Parolam-2026',401);
 assert.equal((await loginAs('deniz@celmak.com','Yeni-Gecici-77')).body.mustChangePassword,true);

 // Geçmiş tarihli sipariş: cari hareketler sipariş tarihiyle işlenir, ileri tarih reddedilir.
 const pastCustomer=await request(sales,'/customers','POST',{name:'Eski Sipariş Cari',tags:['DEALER']},201);
 const pastOrder={...mixed,customerId:pastCustomer.id,advanceAmount:0,downPayment:0,paymentMethod:'CASH',orderDate:'2025-03-10'};
 const tomorrow=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 await request(sales,'/sales','POST',{...pastOrder,orderDate:tomorrow},400);
 const past=await request(sales,'/sales','POST',pastOrder,201);
 await request(sales,`/sales/${past.id}/submit`,'POST');approval=await approvalFor(past.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 detail=await request(admin,`/sales/${past.id}/detail`);assert.equal(detail.sale.orderDate,'2025-03-10');
 assert.equal((await request(admin,'/sales')).find(x=>x.id===past.id).orderDate,'2025-03-10');
 const pastLedger=await request(admin,`/customers/${pastCustomer.id}/ledger`);
 assert.ok(pastLedger.transactions.every(t=>t.transactionDate==='2025-03-10'),'Borç ve peşin tahsilat sipariş tarihiyle işlenmeli');
 assert.equal(pastLedger.customer.balance,0);
 const pastReport=await request(sales,'/reports/machine-orders?from=2025-03-01&to=2025-03-31');
 assert.ok(pastReport.rows.some(r=>r.customerId===pastCustomer.id),'Rapor sipariş tarihine göre süzmeli');
 // Vadeli geçmiş sipariş: peşinat satırı da sipariş tarihli olur.
 const pastTerm=await request(sales,'/sales','POST',{...pastOrder,paymentMethod:'MIXED',instrumentType:'CHECK',instrumentCount:1,downPayment:10000,paymentSchedule:[{dueDate:'2025-04-10',amount:100000}]},201);
 detail=await request(admin,`/sales/${pastTerm.id}/detail`);assert.equal(detail.schedule.find(x=>x.sequenceNo===0).dueDate,'2025-03-10');

 // Sipariş revizyonu: 10 tamburlu onaylandı, 3'ü sevk edildi; bayi 8 tamburlu + 2 silaj istedi.
 const [tambur,silaj]=products.filter(x=>x.partCategory==='MACHINE');
 const revCustomer=await request(sales,'/customers','POST',{name:'Revizyon Bayi',tags:['DEALER']},201);
 const revBalance=async()=>(await request(admin,`/customers/${revCustomer.id}/ledger`)).customer.balance;
 const revOrder=await request(sales,'/sales','POST',{customerId:revCustomer.id,orderKind:'MACHINE',advanceAmount:0,paymentMethod:'TERM',paymentTermDays:30,downPayment:0,currency:'TRY',exchangeRate:1,approvalAssigneeId:manager.id,items:[{productId:tambur.id,quantity:10,unitPrice:100000,vatRate:10}],paymentSchedule:[{dueDate:'2026-12-31',amount:1000000}]},201);
 const amendBody=(items,extra={})=>({amendmentDate:'2026-11-15',reason:'Bayi 8 tamburlu + 2 silaj istedi',items,...extra});
 await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:1,productId:tambur.id,quantity:8,unitPrice:100000,vatRate:10}]),400);
 await request(sales,`/sales/${revOrder.id}/submit`,'POST');approval=await approvalFor(revOrder.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal(await revBalance(),1000000);
 let revDetail=await request(admin,`/sales/${revOrder.id}/detail`);const tamburLine=revDetail.items[0];
 await request(admin,'/shipments','POST',{saleId:revOrder.id,plannedDate:'2026-11-14',deliveryAddress:'Bayi deposu',items:[{saleItemId:tamburLine.id,quantity:3}]},201);
 await request(sales,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:tamburLine.id,productId:tambur.id,quantity:8,unitPrice:100000,vatRate:10}]),403);
 const belowShipped=await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:tamburLine.id,productId:tambur.id,quantity:2,unitPrice:100000,vatRate:10}]),400);
 assert.match(belowShipped.message,/sevk edilmiş/);
 await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:tamburLine.id,productId:tambur.id,quantity:10,unitPrice:100000,vatRate:10}]),400);
 const rev=await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([
  {saleItemId:tamburLine.id,productId:tambur.id,quantity:8,unitPrice:100000,vatRate:10},
  {productId:silaj.id,quantity:2,unitPrice:150000,vatRate:10},
 ],{settlement:'CHECK',settlementDueDate:'2027-01-15'}),201);
 assert.equal(rev.difference,100000);assert.equal(rev.newTotal,1100000);
 assert.equal(await revBalance(),1100000,'Fark cariye borç olarak işlenmeli');
 revDetail=await request(admin,`/sales/${revOrder.id}/detail`);
 assert.deepEqual(revDetail.items.map(x=>x.quantity).sort(),[2,8]);assert.equal(revDetail.sale.grandTotal,1100000);
 assert.equal(revDetail.amendments.length,1);assert.equal(revDetail.amendments[0].changes.length,2);
 const diffRow=revDetail.schedule.find(x=>x.paymentType==='CHECK');assert.equal(diffRow.amount,100000);assert.equal(diffRow.dueDate,'2027-01-15');
 assert.ok((await request(admin,'/instruments')).some(x=>x.saleNumber===revOrder.number&&x.amount===100000&&x.status==='PLANNED'),'Fark için planlı çek oluşmalı');
 const revPlan=await request(admin,`/sales/${revOrder.id}/shipment-plan`);
 assert.deepEqual(revPlan.items.map(x=>x.remainingQuantity).sort(),[2,5],'Sevk planı yeni miktarlara göre güncellenmeli');
 // Fiyat düşerse fark cariye alacak işlenir; sevk edilmiş kalem çıkarılamaz.
 revDetail=await request(admin,`/sales/${revOrder.id}/detail`);
 const silajLine=revDetail.items.find(x=>x.productId===silaj.id),tamburNow=revDetail.items.find(x=>x.productId===tambur.id);
 await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:silajLine.id,productId:silaj.id,quantity:2,unitPrice:150000,vatRate:10}]),400);
 const cheaper=await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody([{saleItemId:tamburNow.id,productId:tambur.id,quantity:8,unitPrice:100000,vatRate:10},{saleItemId:silajLine.id,productId:silaj.id,quantity:2,unitPrice:100000,vatRate:10}]),201);
 assert.equal(cheaper.difference,-100000);assert.equal(await revBalance(),1000000,'İndirim cariye alacak olarak işlenmeli');
 assert.ok((await request(admin,`/customers/${revCustomer.id}/ledger`)).transactions.filter(t=>t.transactionType==='SALE_AMENDMENT').length===2);

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

 // ---- Katalog dışı ürün, e-posta bildirimleri, ödeme planı revizyonu, avans düzeltme, evraksız rapor ----
 // Uygulama içi bildirimler: onaya gönderilen sipariş yöneticiye, sonuç siparişi girene düşer.
 let adminBell=await request(admin,'/notifications');
 assert.ok(adminBell.items.some(n=>/onayınızı bekliyor/.test(n.title)&&n.link==='/onaylar'),'Onaya gönderilen sipariş yöneticiye bildirilmeli');
 let salesBell=await request(sales,'/notifications');
 assert.ok(salesBell.items.some(n=>n.title==='Sipariş onaylandı'&&/^\/satislar\/\d+$/.test(n.link)),'Onay sonucu siparişi girene bildirilmeli');
 assert.ok(salesBell.unread>0);
 await request(sales,'/notifications/read','POST',{ids:[salesBell.items[0].id]});
 assert.equal((await request(sales,'/notifications')).unread,salesBell.unread-1);
 await request(sales,'/notifications/read','POST',{});
 assert.equal((await request(sales,'/notifications')).unread,0);
 const adminUnreadItem=adminBell.items.find(n=>!n.readAt);assert.ok(adminUnreadItem);
 await request(sales,'/notifications/read','POST',{ids:[adminUnreadItem.id]});
 assert.equal((await request(admin,'/notifications')).unread,adminBell.unread,'Başkasının bildirimi işaretlenemez');
 const custom=await request(sales,'/products/custom','POST',{name:'Römork 5 ton, 5 lastikli',orderKind:'MACHINE',vatRate:10},201);
 assert.match(custom.code,/^OZL-/);assert.equal(custom.isCustom,1);
 await request(sales,'/products/custom','POST',{name:'xy',orderKind:'MACHINE',vatRate:10},400);
 assert.ok(!(await request(sales,'/products')).some(p=>p.id===custom.id),'Katalog dışı ürün katalogda görünmemeli');
 const customBuyer=await request(sales,'/customers','POST',{name:'Özel Ürün Bayi',tags:['DEALER']},201);
 const customOrder=await request(sales,'/sales','POST',{customerId:customBuyer.id,orderKind:'MACHINE',advanceAmount:0,paymentMethod:'TERM',paymentTermDays:30,downPayment:0,currency:'TRY',exchangeRate:1,approvalAssigneeId:manager.id,items:[{productId:custom.id,quantity:2,unitPrice:220000,vatRate:10}],paymentSchedule:[{dueDate:'2027-01-31',amount:440000}]},201);
 let customDetail=await request(admin,`/sales/${customOrder.id}/detail`);
 assert.equal(customDetail.items[0].name,'Römork 5 ton, 5 lastikli');assert.equal(customDetail.items[0].isCustom,1);assert.equal(customOrder.grandTotal,440000);
 const pendingBefore=(await request(admin,'/notifications')).pendingApprovals;
 await request(sales,`/sales/${customOrder.id}/submit`,'POST');approval=await approvalFor(customOrder.id);
 assert.equal((await request(admin,'/notifications')).pendingApprovals,pendingBefore+1,'Bekleyen onay sayısı artmalı');
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal((await request(admin,'/notifications')).pendingApprovals,pendingBefore);

 // Evraksız (açık hesap) satış + peşinat: peşinat onayda cariden düşer, kalan iki vadeye bölünür.
 const termBuyer=await request(sales,'/customers','POST',{name:'Peşinatlı Açık Hesap Bayi',tags:['DEALER']},201);
 const termOrder=await request(sales,'/sales','POST',{customerId:termBuyer.id,orderKind:'MACHINE',advanceAmount:0,paymentMethod:'TERM',paymentTermDays:60,downPayment:100000,currency:'TRY',exchangeRate:1,approvalAssigneeId:manager.id,items:[{productId:custom.id,quantity:1,unitPrice:400000,vatRate:10}],paymentSchedule:[{dueDate:'2027-01-15',amount:150000},{dueDate:'2027-02-15',amount:150000}]},201);
 await request(sales,'/sales','POST',{customerId:termBuyer.id,orderKind:'MACHINE',advanceAmount:0,paymentMethod:'TERM',paymentTermDays:60,downPayment:100000,currency:'TRY',exchangeRate:1,approvalAssigneeId:manager.id,items:[{productId:custom.id,quantity:1,unitPrice:400000,vatRate:10}],paymentSchedule:[{dueDate:'2027-01-15',amount:400000}]},400);
 await request(sales,`/sales/${termOrder.id}/submit`,'POST');approval=await approvalFor(termOrder.id);
 await request(admin,`/approvals/${approval.id}/decision`,'POST',{decision:'APPROVED'});
 assert.equal((await request(admin,`/customers/${termBuyer.id}/ledger`)).customer.balance,300000,'Peşinat düşülmüş kalan borç');
 const termDetail=await request(admin,`/sales/${termOrder.id}/detail`);
 assert.deepEqual(termDetail.schedule.map(x=>[x.sequenceNo,x.amount]),[[0,100000],[1,150000],[2,150000]]);
 const termRow=(await request(admin,'/reports/unbacked')).rows.find(r=>r.id===termBuyer.id);
 assert.equal(termRow.plannedTransfers,300000);assert.equal(termRow.unplanned,0);

 // Ödeme şekli değişikliği: revizyon siparişinin kalan planı (havale + planlı çek) iki senede çevrilir.
 revDetail=await request(admin,`/sales/${revOrder.id}/detail`);
 const oldCheck=(await request(admin,'/instruments')).find(x=>x.saleNumber===revOrder.number&&x.status==='PLANNED');
 const currentLines=revDetail.items.map(x=>({saleItemId:x.id,productId:x.productId,quantity:x.quantity,unitPrice:Number((x.lineTotal/x.quantity).toFixed(2)),vatRate:x.vatRate}));
 const balanceBefore=await revBalance();
 await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody(currentLines,{paymentPlan:[{paymentType:'PROMISSORY_NOTE',dueDate:'2027-02-15',amount:400000}]}),400);
 const replanned=await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody(currentLines,{paymentPlan:[{paymentType:'PROMISSORY_NOTE',dueDate:'2027-02-15',amount:500000},{paymentType:'PROMISSORY_NOTE',dueDate:'2027-03-15',amount:500000}]}),201);
 assert.equal(replanned.difference,0);assert.match(replanned.message,/Ödeme planı yenilendi/);
 assert.equal(await revBalance(),balanceBefore,'Yalnızca ödeme şekli değişince cari bakiye değişmemeli');
 revDetail=await request(admin,`/sales/${revOrder.id}/detail`);
 assert.deepEqual(revDetail.schedule.filter(x=>x.sequenceNo>0).map(x=>[x.paymentType,x.amount,x.instrumentStatus]),[['PROMISSORY_NOTE',500000,'PLANNED'],['PROMISSORY_NOTE',500000,'PLANNED']]);
 assert.equal(revDetail.sale.paymentMethod,'CHECK');assert.equal(revDetail.amendments[0].settlement,'REPLAN');assert.equal(revDetail.amendments[0].paymentPlan.replaced.length,2);
 const afterInstruments=await request(admin,'/instruments');
 assert.equal(afterInstruments.find(x=>x.id===oldCheck.id).status,'CANCELLED','Eski planlı çek iptal edilmeli');
 assert.equal(afterInstruments.filter(x=>x.saleNumber===revOrder.number&&x.status==='PLANNED'&&x.instrumentType==='PROMISSORY_NOTE').length,2);
 assert.ok(afterInstruments.every(x=>x.saleNumber!==revOrder.number||x.saleId===revOrder.id),'Evrak listesinde sipariş kimliği olmalı');
 // Teslim alınan senet yeniden planlamada değişmez.
 const firstNote=afterInstruments.find(x=>x.saleNumber===revOrder.number&&x.status==='PLANNED'&&x.dueDate==='2027-02-15');
 await request(admin,`/instruments/${firstNote.id}`,'PUT',{issuer:'Revizyon Bayi',serialNumber:'SN-1',bankName:'',issueDate:'2026-11-15'});
 await request(admin,`/instruments/${firstNote.id}/movements`,'POST',{status:'IN_PORTFOLIO',movementDate:'2026-11-16'});
 const toTransfer=await request(admin,`/sales/${revOrder.id}/amendments`,'POST',amendBody(currentLines,{paymentPlan:[{paymentType:'BANK_TRANSFER',dueDate:'2027-04-01',amount:500000}]}),201);
 revDetail=await request(admin,`/sales/${revOrder.id}/detail`);
 assert.deepEqual(revDetail.schedule.filter(x=>x.sequenceNo>0).map(x=>x.paymentType).sort(),['BANK_TRANSFER','PROMISSORY_NOTE']);
 assert.equal(revDetail.sale.paymentMethod,'CHECK');assert.ok(toTransfer.number);
 assert.ok((await request(sales,'/notifications')).items.some(n=>n.title==='Sipariş revize edildi'&&n.link===`/satislar/${revOrder.id}`),'Revizyon siparişi girene bildirilmeli');

 // Avans düzeltme: yanlış girilen avans ters kayıt + doğru kayıtla düzeltilir; iptal edilebilir.
 const advCustomer=await request(sales,'/customers','POST',{name:'Avans Düzeltme Bayi',tags:['DEALER']},201);
 const advBalance=async()=>(await request(admin,`/customers/${advCustomer.id}/ledger`)).customer.balance;
 const wrong=await request(admin,'/receipts','POST',{customerId:advCustomer.id,method:'BANK_TRANSFER',receiptDate:'2026-11-10',amount:25000,currency:'TRY',exchangeRate:1,reference:'DEK-1'},201);
 assert.equal(await advBalance(),-25000);
 await request(sales,`/receipts/${wrong.id}`,'PUT',{method:'BANK_TRANSFER',receiptDate:'2026-11-10',amount:250000,exchangeRate:1,reason:'Tutar eksik girildi'},403);
 await request(admin,`/receipts/${wrong.id}`,'PUT',{method:'BANK_TRANSFER',receiptDate:'2026-11-10',amount:250000,exchangeRate:1},400);
 const fixed=await request(admin,`/receipts/${wrong.id}`,'PUT',{method:'BANK_TRANSFER',receiptDate:'2026-11-10',amount:250000,exchangeRate:1,reference:'DEK-1',reason:'Tutar eksik girildi'});
 assert.equal(await advBalance(),-250000,'Düzeltilen avans bakiyeye doğru yansımalı');
 await request(admin,`/receipts/${wrong.id}`,'PUT',{method:'BANK_TRANSFER',receiptDate:'2026-11-10',amount:1,exchangeRate:1,reason:'Tekrar'},404);
 let advLedger=await request(admin,`/customers/${advCustomer.id}/ledger`);
 assert.deepEqual(advLedger.advanceReceipts.map(r=>[r.number,r.amount]),[[fixed.number,250000]]);
 assert.ok(advLedger.transactions.some(t=>t.transactionType==='RECEIPT_REVERSAL'&&t.debit===25000));
 await request(admin,`/receipts/${fixed.id}/reverse`,'POST',{reason:'Mükerrer giriş'});
 assert.equal(await advBalance(),0);
 // Açılış bakiyesi (devir) düzeltmesi: BEREKET TARIM avansı 15.580.325,33 → 15.000.000.
 let bereketLedger=await request(admin,`/customers/${bereket.id}/ledger`);
 assert.equal(bereketLedger.opening.amount,-15580325.33);
 await request(sales,`/customers/${bereket.id}/opening-balance`,'PUT',{amount:-15000000,date:'2026-11-17',reason:'Mutabakat'},403);
 await request(admin,`/customers/${bereket.id}/opening-balance`,'PUT',{amount:-15580325.33,date:'2026-11-17',reason:'Aynı'},400);
 await request(admin,`/customers/${bereket.id}/opening-balance`,'PUT',{amount:-15000000,date:'2026-11-17',reason:'Mutabakat sonrası düzeltme'});
 bereketLedger=await request(admin,`/customers/${bereket.id}/ledger`);
 assert.equal(bereketLedger.customer.balance,-15000000);assert.equal(bereketLedger.opening.amount,-15000000);
 assert.ok(bereketLedger.transactions.some(t=>t.transactionType==='OPENING_BALANCE_ADJUSTMENT'&&t.debit===580325.33));
 await request(admin,`/customers/${advCustomer.id}/opening-balance`,'PUT',{amount:-5,date:'2026-11-17',reason:'Yok'},404);
 // Döviz cinsinden açılış: düzeltme aynı kurla işlenir.
 await request(admin,`/customers/${eur.created[0].id}/opening-balance`,'PUT',{amount:30000,date:'2026-11-17',reason:'Kur düzeltmesi değil, tutar'});
 assert.equal((await request(admin,`/customers/${eur.created[0].id}/ledger`)).customer.balance,1500000);

 // Evraksız alacak raporu: borçlu bayiler; vadeli havale, teslim alınmamış evrak ve plansız açık cari ayrımı.
 const unbacked=await request(sales,'/reports/unbacked');
 const revRow=unbacked.rows.find(r=>r.id===revCustomer.id);
 assert.ok(revRow,'Borcu olan bayi raporda olmalı');
 assert.equal(revRow.balance,await revBalance());
 assert.equal(revRow.plannedTransfers,500000);assert.equal(revRow.pendingInstruments,0,'Teslim alınan senet evraksız sayılmamalı');
 assert.ok(revRow.items.every(i=>i.saleId===revOrder.id));
 const customRow=unbacked.rows.find(r=>r.id===customBuyer.id);assert.equal(customRow.plannedTransfers,440000);assert.equal(customRow.unplanned,0);
 assert.ok(!unbacked.rows.some(r=>r.id===bereket.id),'Avanslı cari evraksız alacakta görünmemeli');
 const mirayRow=unbacked.rows.find(r=>r.id===balanceTarget.id);assert.equal(mirayRow.unplanned,276000,'Devir borcu plansız açık cari sayılmalı');
 assert.equal(unbacked.totals.customers,unbacked.rows.length);
 console.log('PASS: eşit olmayan 4 çek, hedef/toplam farkı, grup kaydı, mükerrer/tekrar istek koruması, atomik geri alma, tahsilat ve karşılıksız çek bakiyesi');
 console.log('PASS: parça siparişi, düzenleme, revizyon, onay, 2 milyon avans, makine/parça mahsup, kısmi avans, mükerrer ve yetersiz bakiye kontrolleri');
 console.log('PASS: KDV dahil fiyat, 0/10/20 KDV kısıtı, kredi kartı tahsilatı, iade (sevk/yetki/miktar kontrolleri), makine raporu, cari notu, Excel ile toplu cari, cari düzenleme ve silme, açılış bakiyesi (devir), kullanıcı yönetimi ve parola değiştirme, geçmiş tarihli sipariş, onaylı sipariş revizyonu');
 console.log('PASS: katalog dışı ürün, peşinatlı açık hesap satış, uygulama içi bildirimler (okundu, bekleyen onay sayısı), ödeme şekli değişikliği (çek → senet → havale), avans ve açılış bakiyesi düzeltme, evraksız alacak raporu');
} finally {
 server.kill();await new Promise(r=>server.once('exit',r));
 assert.equal(dirname(resolve(dataDir)),resolve(tmpdir()));
 assert.ok(basename(dataDir).startsWith("celmak-orders-"));
 rmSync(dataDir,{recursive:true,force:true});
}
