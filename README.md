#### For this branch, you need to extract the comments from database 
- DONT FUCK AROUND, you are the superuser from remote database. you can simply drop table DONT DO THAT
- Make sure your tailscale is up and joined my network. if not, lmk


Go to "backend" folder, you will see "getDataFromServer.py". That's where you do your work. 

This file has set up the remote server with "select comment from table". Here is the results from database:

```
('Kain lembut, chiffon kualiti, beli masa sale. Dapat harga sale murah. Harap dapat beli lgi harga murah. Chiffon ni tak panas. Sesuai pakai kemana sahaja.',)
('Terima kasih semua item betul,tiada sebarang kerosakan.jahitan tepi kemas\n\nCorak2 yang cantik,warna yang menarik\nSy suka pakai tudung Dari FAREHA dah banyak koleksi yang telah saya ada',)
('Tudung Telah Diterima Cukup Lengkap Seperti Ordered. Kain Cotton Selesa Dipakai. Corak Menarik. Harga Murah Beli Masa Live. Highly Recommended & Thank You Seller',)
('Beli masa live dapat harga rm5. 90 sehelai. Beli 3 helai terus grab. Puas hati. Corak cantik. Terima kasih seller. Nnty boleh beli lagi corak yang lain. Basuh dulu sebelum guna.',)
('Cantik ya corak Amami ni 🥰 Beli utk jadikan hadiah utk kawan punya birthday. Terima kasih Fareha HQ buat sale harga murah2 sgt utk tudung yg berkualiti.',)
```
You will found that the text has emoji, \n\n or any unwated character.


What you have to do is to extract the comment from database using **pandas library**, clean the data by removing unncessary words. This is to store data for vector embedding.

The outcome should be a cleaned data in csv form. 

To do
- [ ] Get data from database and clean it straightaway in the same script
- [ ] Embed to vector via Sentence-BERT (not now)
- [ ] Store in vector database (not now) 