# Test Tutorial

A setup test

<iframe width="560" height="315" src="https://www.youtube.com/embed/JU3vT-O2qNg" frameborder="0" allowfullscreen></iframe>

### Attached Script

```python
import time
import pyautogui
import subprocess
import glob
import os
import pickle
import pyperclip 
import re
import keyboard
from obswebsocket import obsws, requests 
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# --- NEW FOCUS BUFFER ---
print("\n>>> QUICK: Click your Pane Studio timeline to focus it! <<<")
print("Starting in 6...")
time.sleep(2)
print("4...")
time.sleep(2)
print("2...")
time.sleep(2)

# 1. Connect to the OBS WebSocket Server
client = obsws("localhost", 4455, "obsobs") 
client.connect() 

# 2. Start Recording
print("Starting OBS Capture...")
client.call(requests.StartRecord())
time.sleep(1) 

# 3. Trigger Pane Studio Playback
print("Triggering Playback...")
# A robust spacebar press (holds it down for 0.1 seconds so the app registers it)
pyautogui.keyDown('space')
time.sleep(0.1)
pyautogui.keyUp('space')

# 4. Wait for the tutorial duration (DYNAMIC)
print("\n>>> RECORDING IN PROGRESS <<<")
print("Press the 'F9' key on your keyboard when the video finishes playing.")
keyboard.wait('f9') # The script freezes here until you press F9

# 5. Stop Recording
print("Stopping OBS Capture...")
client.call(requests.StopRecord())
client.disconnect() 
time.sleep(2) # Buffer to allow OBS to finish saving the file to your hard drive

# 6. Locate the newest video in your OBS output directory
obs_output_folder = r"C:\Users\BMW\Documents\Omniverse Tutorials\OBS Export"

# Check for BOTH .mp4 and .mkv files to prevent the crash
list_of_files = glob.glob(f"{obs_output_folder}\\*.mp4") + glob.glob(f"{obs_output_folder}\\*.mkv")

if not list_of_files:
    print(f"\nERROR: No video files found in {obs_output_folder}")
    print("Please check your OBS Settings > Output > Recording Path to ensure it matches this exact folder.")
    exit() 

latest_file = max(list_of_files, key=os.path.getctime)

# 7. Run Auto-Editor to remove silence
print(f"Trimming silence from {latest_file}...")
output_trimmed = latest_file.replace(".mp4", "_final.mp4")

# Removed the --export flag so Auto-Editor defaults to standard MP4 output
subprocess.run([
    "python", "-m", "auto_editor", latest_file, 
    "--edit", "audio:threshold=0.5%", 
    "--margin", "0.3s", 
    "-o", output_trimmed
])

print(f"Pipeline complete! Final video saved to: {output_trimmed}")

# --- YOUTUBE UPLOAD BLOCK ---
print("Uploading to YouTube...")
SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# FIX: Hardcode the absolute paths so Python never loses them
secrets_file = r"C:\Users\BMW\Documents\Omniverse Tutorials\client_secrets.json"
token_file = r"C:\Users\BMW\Documents\Omniverse Tutorials\token.pickle"

creds = None
if os.path.exists(token_file):
    with open(token_file, "rb") as token:
        creds = pickle.load(token)
if not creds or not creds.valid:
    flow = InstalledAppFlow.from_client_secrets_file(secrets_file, SCOPES)
    creds = flow.run_local_server(port=0)
    with open(token_file, "wb") as token:
        pickle.dump(creds, token)

youtube = build("youtube", "v3", credentials=creds)

request_body = {
    "snippet": {
        "title": "Omniverse Intern Tutorial",
        "description": "Automated upload",
        "tags": ["omniverse", "tutorial"]
    },
    "status": {
        "privacyStatus": "unlisted" 
    }
}

media_file = MediaFileUpload(output_trimmed, chunksize=-1, resumable=True)
response = youtube.videos().insert(
    part="snippet,status",
    body=request_body,
    media_body=media_file
).execute()

video_id = response.get("id")
print(f"\nUpload Success! Link: https://youtu.be/{video_id}")

# --- AUTOMATED MARKDOWN & GIT DEPLOYMENT ---
print("Let's build the documentation page.")

title = input("\nWhat is the title of this tutorial? ")
description = input("Type a quick explanation for the interns: ")

print("\nPaste any Python/USD script you want to include.")
print("(Type 'END' on a new line when you are finished pasting):")
code_snippet = []
while True:
    line = input()
    if line.strip() == 'END':
        break
    code_snippet.append(line)
formatted_code = "\n".join(code_snippet)

slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

file_path = f"C:/Users/BMW/Documents/Omniverse Tutorials/my-docs/docs/{slug}.md"

markdown_content = f"""# {title}

{description}

<iframe width="560" height="315" src="https://www.youtube.com/embed/{video_id}" frameborder="0" allowfullscreen></iframe>

"""

if formatted_code:
    markdown_content += f"### Attached Script\n\n```python\n{formatted_code}\n```\n"

with open(file_path, "w") as file:
    file.write(markdown_content)
print(f"\nGenerated Markdown file at: {file_path}")

print("Pushing to GitHub...")
mkdocs_dir = r"C:\Users\BMW\Documents\Omniverse Tutorials\my-docs"

subprocess.run(["git", "add", "."], cwd=mkdocs_dir)
subprocess.run(["git", "commit", "-m", f"Auto-publish tutorial: {title}"], cwd=mkdocs_dir)
subprocess.run(["git", "push", "origin", "main"], cwd=mkdocs_dir)

github_username = "mxbdesign" 
repo_name = "omniverse_tutorials" 
live_url = f"https://{github_username}.github.io/{repo_name}/{slug}/"

print(f"\n=========================================")
print(f"SUCCESS! The pipeline is complete.")
print(f"Your tutorial will be live in ~60 seconds at:")
print(live_url)
print(f"=========================================")
```
