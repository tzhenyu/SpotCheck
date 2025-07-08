### I need y'all help: Scrape some data for behavioral analysis

Scope:
- Shopee
- Shirts category
- Each member extract comment on 15 different products

#### Set up Tailscale
1. Install tailscale, google it yourself
2. Join this https://login.tailscale.com/uinv/i1db424acee175eca. Make sure you login with the same account as the client.
#### Git Pull
1. Commit your branch to prevent any loss, better if push
2. In GitHub, change to the branch "feature_relational_database"
```Source Control > Repository > a branch name```

```Click that branch name, click "origin/feature_relational_database"```

2. Git pull it

#### Open the backend server
1. in the Terimnal:
```bash 
pip install -r requirements.txt
python ./backend/backend.py
```
If it look like this below, you did it correct.
```
> python ./backend/backend.py
INFO:__main__:Starting API server on http://127.0.0.1:8000
INFO:     Started server process [41750]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

#### Install the extension 
1. Go to your browser settings > extension
2. enable developer mode
3. press load unpacked, it will prompt you to open folder (if cant find it just google it yourself)
4. load the "src" folder from this git repo
5. The extension should be installed in your browser.
6. Pin it on your toolbar, convenient for you

#### Scrape the data 
1. Go to any shopee product webpage
2. The product ratings section can choose what comment you want, choose "With Comments" 
3. Click the extension from toolbar, it should show "6 comments extracted"
4. Click the "extract all pages (30)" buttons
5. it will automatically navigate comment page, let it sit, dont do anything
6. After it stopped, means its done. 
7. Click the extension to close it, click again to reopen it.
8. There's a "upload to sql server" button. Click it
9. If there's a successful message, you are done!

#### Repeat it for 15 different pages