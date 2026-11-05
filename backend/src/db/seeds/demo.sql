-- demo.sql — seed cong ty demo 12 khoi (dev only, chay qua npm run seed:demo)
INSERT INTO departments(code,name,budget_month) VALUES
('ceo','Van phong CEO',50000000),('sales','Kinh doanh',200000000),('marketing','Marketing',100000000),
('cskh','Cham soc khach hang',50000000),('ops','Van hanh',150000000),('supply','Mua-Kho-Logistics',150000000),
('finance','Tai chinh-Ke toan',80000000),('hr','Nhan su-Hanh chinh',80000000),('it','Cong nghe',100000000),
('legal','Phap che-Kiem soat',50000000),('qa','Chat luong',30000000),('product','San pham-R&D',60000000)
ON CONFLICT(code) DO NOTHING;

INSERT INTO employees(code,name,dept_code,title,manager_id,phone,salary_base,status,hired_date) VALUES
('CEO001','Nguyen Van An','ceo','CEO',NULL,'0900000001',80000000,'active','2024-01-01'),
('COO001','Tran Van Binh','ceo','COO',1,'0900000002',60000000,'active','2024-01-01'),
('SD001','Le Thi Giam','sales','Director',1,'0900000011',40000000,'active','2024-02-01'),
('NV101','Pham Van Sale1','sales','Executive',3,'0900000012',12000000,'active','2024-03-01'),
('NV102','Ho Thi Sale2','sales','Executive',3,'0900000013',12000000,'active','2024-03-01'),
('MM001','Vu Thi MKT','marketing','Manager',1,'0900000021',25000000,'active','2024-02-01'),
('NV201','Do Van Digital','marketing','Executive',6,'0900000022',14000000,'active','2024-04-01'),
('CSM001','Ngo Thi CS','cskh','Manager',1,'0900000031',22000000,'active','2024-02-01'),
('CSL001','Bui Thi Truong','cskh','Leader',8,'0900000032',16000000,'active','2024-03-01'),
('NV301','Ly Van CS1','cskh','Executive',9,'0900000033',11000000,'active','2024-04-01'),
('NV302','Phan Thi CS2','cskh','Executive',9,'0900000034',11000000,'active','2024-04-01'),
('OM001','Dang Van Ops','ops','Manager',2,'0900000041',25000000,'active','2024-02-01'),
('NV401','Trinh Van Ops1','ops','Executive',12,'0900000042',13000000,'active','2024-03-01'),
('NV402','Vo Thi Ops2','ops','Executive',12,'0900000043',13000000,'active','2024-03-01'),
('PU001','Hoang Van Mua','supply','Procurement',2,'0900000051',15000000,'active','2024-03-01'),
('WH001','Cao Van Kho','supply','Warehouse',2,'0900000052',14000000,'active','2024-03-01'),
('LG001','Luong Van Giao','supply','Logistics',2,'0900000053',13000000,'active','2024-03-01'),
('CFO001','Dinh Thi Tai','finance','CFO',1,'0900000061',50000000,'active','2024-01-15'),
('KT001','Mai Thi Ke','finance','Accountant',18,'0900000062',18000000,'active','2024-02-15'),
('AR001','Quach Van No','finance','Executive',18,'0900000063',14000000,'active','2024-03-15'),
('HRM001','Tang Thi Nhan','hr','Manager',1,'0900000071',24000000,'active','2024-02-01'),
('NV701','Kieu Van Tuyen','hr','Executive',21,'0900000072',13000000,'active','2024-04-01'),
('CTO001','Ha Van Cong','it','CTO',1,'0900000081',55000000,'active','2024-01-10'),
('NV801','Thai Van Dev1','it','Developer',23,'0900000082',25000000,'active','2024-02-10'),
('NV802','Tu Thi Dev2','it','Developer',23,'0900000083',25000000,'active','2024-02-10'),
('NV803','Ung Van Support','it','Support',23,'0900000084',15000000,'active','2024-03-10'),
('LGAL01','Co Van Luat','legal','Legal',1,'0900000091',28000000,'active','2024-02-01'),
('QA001','Nhan Vien QA','qa','Manager',2,'0900000092',20000000,'active','2024-03-01'),
('PD001','Pham Van San','product','Manager',1,'0900000093',26000000,'active','2024-02-01');

INSERT INTO users(employee_code,username,password_hash,role) VALUES
('CEO001','admin','__ADMIN_HASH__','owner'),
('CFO001','ketoan','__USER_HASH__','accountant'),
('WH001','kho','__USER_HASH__','warehouse'),
('NV101','sale','__USER_HASH__','sales'),
('NV301','cskh','__USER_HASH__','cskh')
ON CONFLICT(username) DO NOTHING;

INSERT INTO customers(code,name,phone,type,owner_employee_id) VALUES
('KH001','Ca phe Highlands Demo','0901234567','retail',4),
('KH002','Tap hoa Co Ba','0912345678','wholesale',5),
('KH003','Cong ty An Phat','0923456789','enterprise',4)
ON CONFLICT(code) DO NOTHING;

INSERT INTO campaigns(name,channel,cost,start_date,end_date) VALUES
('Khai truong TikTok','tiktok',2000000,date('now','-10 days'),date('now','+20 days'));

INSERT INTO leads(name,phone,source,campaign_id,stage,owner_employee_id,amount_expected,last_touch) VALUES
('Anh Tuan','0931111111','tiktok',1,'new',4,5000000,date('now')),
('Chi Hoa','0932222222','facebook',NULL,'mql',4,8000000,date('now','-1 day')),
('Cong ty Binh Minh','0933333333','referral',NULL,'sql',5,50000000,date('now','-1 day')),
('Shop Co Tu','0934444444','shopee',NULL,'won',5,10000000,date('now','-5 days'));

INSERT INTO quotes(code,lead_id,customer_id,amount,status,valid_until) VALUES
('BG001',4,2,10000000,'accepted',date('now','+15 days'));

INSERT INTO contracts(code,customer_id,quote_id,amount,status,signed_date) VALUES
('HD001',2,1,10000000,'signed',date('now','-4 days'));

INSERT INTO products(sku,name,price,cost,unit,stock_alert) VALUES
('CF-SUA-01','Ca phe sua',35000,18000,'ly',20),
('TRA-DAO-01','Tra dao',40000,20000,'ly',20),
('BANH-01','Banh ngot',25000,12000,'cai',20)
ON CONFLICT(sku) DO NOTHING;

INSERT INTO stock_moves(product_sku,type,qty,ref_code) VALUES
('CF-SUA-01','in',100,'TON-DAU'),('TRA-DAO-01','in',80,'TON-DAU'),('BANH-01','in',25,'TON-DAU');

INSERT INTO orders(code,customer_id,contract_id,employee_id,amount,status,order_date) VALUES
('DH001',1,NULL,4,5200000,'pending',date('now','-4 days')),
('DH002',2,1,5,1850000,'pending',date('now','-3 days'));

INSERT INTO order_items(order_id,product_sku,qty,price,cost) VALUES
(1,'CF-SUA-01',50,35000,18000),(1,'BANH-01',20,25000,12000),
(2,'TRA-DAO-01',30,40000,20000);

INSERT INTO stock_moves(product_sku,type,qty,ref_code) VALUES
('CF-SUA-01','out',-50,'DH001'),('BANH-01','out',-20,'DH001'),('TRA-DAO-01','out',-30,'DH002');

INSERT INTO debts(customer_id,order_id,type,amount,paid,due_date,status) VALUES
(1,1,'receivable',5200000,2000000,date('now','-1 day'),'open'),
(2,2,'receivable',1850000,0,date('now','+2 days'),'open');

INSERT INTO payments(debt_id,order_id,amount,method,actor,note) VALUES
(1,1,2000000,'bank','ketoan','Thu CK dot 1 DH001');

INSERT INTO shipments(order_id,carrier,status,ship_fee) VALUES
(1,'GHN','pending',30000),(2,'GHTK','pending',25000);

INSERT INTO suppliers(code,name,phone,rating) VALUES
('NCC01','NCC Nguyen lieu Da Lat','0909999999',5)
ON CONFLICT(code) DO NOTHING;

INSERT INTO purchase_orders(code,supplier_id,amount,status,need_date) VALUES
('PO001',1,12000000,'sent',date('now','+5 days'));

INSERT INTO tickets(code,customer_id,category,subject,content,status,priority) VALUES
('TCK-0001',1,'easy','Hoi gio mo cua','Shop mo cua may gio?','open','low'),
('TCK-0002',2,'technical','Hang loi','Giao thieu 2 ly','open','high');

INSERT INTO ratings(customer_id,order_id,stars,comment) VALUES (1,1,5,'Rat ngon');

INSERT INTO budgets(dept_code,month,planned,actual) VALUES
('sales',strftime('%Y-%m','now'),200000000,50000000),
('marketing',strftime('%Y-%m','now'),100000000,2000000),
('ops',strftime('%Y-%m','now'),150000000,10000000);

INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES
('expense',1,20,'manager','pending');

INSERT INTO expenses(code,type,amount,paid,due_date,note,status) VALUES
('CP001','fee',8000000,0,date('now','+5 days'),'Tien nha thang nay','open');

INSERT INTO it_incidents(code,title,severity,status) VALUES ('INC-001','May in bill ket noi cham','p3','open');
INSERT INTO product_features(title,stage,owner) VALUES ('Combo sang sieu tiet kiem','testing',29);
INSERT INTO risks(title,level,owner,status) VALUES ('No qua han tang cuoi thang','medium',18,'open');
INSERT INTO sop_tasks(dept_code,title,owner,due_date,status) VALUES ('supply','Kiem ke kho cuoi tuan',16,date('now','+3 days'),'todo');
INSERT INTO recruitments(position,dept_code,qty,status,opened_date,cost) VALUES ('Sales Executive','sales',2,'open',date('now'),5000000);

-- Audit seed cho I4 + giao dich matched cho I5 (DB moi seed lan dau):
INSERT INTO transactions(trans_date,amount,content,bank_ref,matched_order_id,status) VALUES(date('now','-3 days'),2000000,'TT DH001 KH001','BANK-SEED-001',1,'matched') ON CONFLICT(bank_ref) DO NOTHING;
INSERT INTO audit_log(actor,action,table_name,record_id,new_json) SELECT 'seed','create','payments',id,'{"seed":true}' FROM payments;
INSERT INTO audit_log(actor,action,table_name,record_id,new_json) SELECT 'seed','create','stock_moves',id,'{"seed":true}' FROM stock_moves;
INSERT INTO audit_log(actor,action,table_name,record_id,new_json) SELECT 'seed','create','debts',id,'{"seed":true}' FROM debts;
