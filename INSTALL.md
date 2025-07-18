# Installing SpotCheck

SpotCheck is available and tested on: 
- Ubuntu (24.04 LTS)

**Contents:**
- [Recommended Installation](#packages-installation-recommended)
- [Minimal Installation](#packages-installation-minimal)
- [Adding Extension to Browser](#Add-Extension-to-Chromium-Browser)
- [Gemini API setup](#Setup-Gemini-API-Minimal-Only)
- [Uninstalling Spotcheck](#Uninstalling-Spotcheck)

## Packages Installation (Recommended)

This section is for installing SpotCheck using recommended settings deployed locally for optimal performance. 
If your system hardware is unable to locally host resources, refer to [Minimal Packages Installation](#packages-installation-minimal).

Packages to be installed :
- Python and related packages
- Ollama for local LLM deployment
- Google Chrome for extension*
> This is optional if you have a chromium-based browser (such as Edge, Brave or Google Chrome) already installed, you may choose to skip this during the installation in terminal.

### Linux (Ubuntu)

Step 1. Copy and run the command below in terminal. Follow the prompts carefully.

```bash
curl -fsSL "tzhenyu.github.io/SpotCheck/install.sh" | sh
```

Successful installation should look like this: 

##### All Green Ticks

![Successful Installation](https://tzhenyu.github.io/SpotCheck/image/success.png)

Step 2. Continue to [Adding Extension](#Add-Extension-to-Chromium-Browser) on your browser manually.

---

## Packages Installation (Minimal)

Minimal installation is intended for users with systems unable to host local LLM models. Instead of local LLM hosting, cloud hosting is utilized with compromise on performance.

If your system is able to host locally, and for optimal performance refer to [Recommended Installation](#packages-installation-recommended)

### Linux(Ubuntu)

Step 1. Copy and run the command below in terminal. Follow the prompts carefully.

```bash
curl -fsSL "tzhenyu.github.io/SpotCheck/install.sh" | sh
```

Step 2. When prompted to install Ollama, skip by entering `n`.

Step 3. Continue to [Adding Extension](#Add-Extension-to-Chromium-Browser) on your browser manually after install script finishes.


---

## Setup Gemini API (Minimal Only)

Before continuing, make sure the SpotCheck Extension is setup. If not, refer to [Adding Extension to Browser](#). 

Step 1. Login to [Google AI Studio](https://aistudio.google.com) using a Google Account.

Step 2. Select ***+ Create API Key*** on the top-right corner.

Step 3. Copy the API Key into clipboard.

Step 4. Paste the API Key in the Extension.

Step 5. Click the ***save API Key*** in the Extension. 

## Add Extension to Chromium Browser

Non-chromium browser are currently unsupported. (E.g. Firefox, Zen, etc)

> For **Ubuntu**, the extension directory is located in `/home/SpotCheck/src` by default

> For **Minimal Setup**, refer to [Gemini API setup](#Setup-Gemini-API-Minimal-Only) **AFTER** adding extension to browser

### Google Chrome

Step 1. Launch Google Chrome.

Step 2. Type `chrome://extensions/` in the address bar and press `enter`. 

Step 3. Turn on Developer settings on the top right-hand conner of the page.

Step 4. Select ***Load unpacked*** from the 3 selections that appeared on the top. 

Step 5. Navigate to `src` folder/directory on the file explorer.


### Brave

Step 1. Launch Brave Web Browser.

Step 2. Type `brave://extensions/` in the address bar and press `enter`.

Step 3. Turn on Developer settings on the top right-hand conner of the page.

Step 4. Select ***Load unpacked*** from the 3 selections that appeared on the top. 

Step 5. Navigate to `src` folder/directory on the file explorer.


### Microsoft Edge (why?)

Step 1. Launch Microsoft Edge.

Step 2. Type `edge://extensions/` in the address bar and press `enter`.

Step 3. Turn on Developer settings on the left tab of the page.

Step 4. Select ***Load unpacked*** from the 3 selections that appeared on the top right-hand corner.

Step 5. Navigate to `src` folder/directory on the file explorer.

---

## Uninstalling SpotCheck

Run the commands below following the order in terminal.

```bash
# kill running SpotCheck processes
sudo pkill -f "python.*backend.py" && sudo pkill -f "/home/SpotCheck_venv/bin/python"

# Remove Ollama model and uninstall Ollama (for recommended setup)
ollama stop llama3:instruct && ollama rm llama3:instruct && sudo apt remove ollama

# Removes python packages installed
python3 -m uninstall -r /home/SpotCheck/requirements.txt

# Removes the SpotCheck folder and contents
rm -r /home/SpotCheck /home/SpotCheck_venv

```
