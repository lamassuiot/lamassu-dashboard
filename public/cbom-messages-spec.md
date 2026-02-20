# Protocol Overview

The Crypto Scanner uses a stateful WebSocket connection to provide real-time visibility into the repository analysis process. The server follows a strict sequence: Initialization $\rightarrow$ Environment Setup $\rightarrow$ Detection Streaming.


1. Request Messages (Client to Server)
These messages initiate the action. In this log, there is only one primary request type.

scanUrl
Purpose: Sent by the client to tell the server which repository to clone and analyze.

```JSON
{
  "type": "send",
  "time": 1771602762.887276,
  "opcode": 1,
  "data": "{\"scanUrl\":\"https://github.com/lamassuiot/lamassuiot\"}"
}
```

2. Status & Progress Messages (Server to Client)
These provide real-time feedback on the infrastructure operations.

LABEL (General Status)
Purpose: Updates the UI text to let the user know what the backend is currently doing.

```JSON
{
  "type": "receive",
  "time": 1771602762.9301598,
  "opcode": 1,
  "data": "{\"type\":\"LABEL\",\"message\":\"Starting...\"}"
}
```
LABEL (Progress Percentage)
Purpose: High-frequency updates showing the state of the Git clone or file checkout.

```JSON
{
  "type": "receive",
  "time": 1771602781.049994,
  "opcode": 1,
  "data": "{\"type\":\"LABEL\",\"message\":\"Cloning git repository: Checking out files 100%\"}"
}
LABEL (Module Discovery)
Purpose: Notifies the client that a specific sub-project or directory has been indexed for scanning.

```JSON
{
  "type": "receive",
  "time": 1771602781.1493049,
  "opcode": 1,
  "data": "{\"type\":\"LABEL\",\"message\":\"Found project module 'backend' [108 .go files]\"}"
}
```

3. Metadata Messages
These provide specific technical details about the repository being processed.

GITURL
Purpose: Confirms the repository source.

```JSON
{
  "type": "receive",
  "time": 1771602762.976523,
  "opcode": 1,
  "data": "{\"type\":\"GITURL\",\"message\":\"https://github.com/lamassuiot/lamassuiot\"}"
}
```

BRANCH
Purpose: Identifies the Git branch (e.g., main, develop).

```JSON
{
  "type": "receive",
  "time": 1771602762.9774098,
  "opcode": 1,
  "data": "{\"type\":\"BRANCH\",\"message\":\"main\"}"
}
```

REVISION_HASH
Purpose: Provides the specific unique commit hash used for the scan to ensure auditability.

```JSON
{
  "type": "receive",
  "time": 1771602781.054975,
  "opcode": 1,
  "data": "{\"type\":\"REVISION_HASH\",\"message\":\"621cbe4\"}"
}
```

4. Detection Messages
These are the most critical messages, containing the results of the security analysis.

DETECTION (Cryptographic Asset)
Purpose: Reports a specific cryptographic algorithm or property found in the code, including the exact line number and file path.

```JSON
{
  "type": "receive",
  "time": 1771602782.370038,
  "opcode": 1,
  "data": "{\"type\":\"DETECTION\",\"message\":\"{\\\"type\\\":\\\"cryptographic-asset\\\",\\\"bom-ref\\\":\\\"6ba725cc-37d4-4b08-8857-8a3dc31fa6db\\\",\\\"name\\\":\\\"RSA\\\",\\\"evidence\\\":{\\\"occurrences\\\":[{\\\"location\\\":\\\"core/pkg/engines/cryptoengines/cryptoengine_testset.go\\\",\\\"line\\\":118,\\\"offset\\\":7,\\\"additionalContext\\\":\\\"VerifyPSS\\\"}]},\\\"cryptoProperties\\\":{\\\"assetType\\\":\\\"algorithm\\\",\\\"algorithmProperties\\\":{\\\"primitive\\\":\\\"signature\\\"},\\\"oid\\\":\\\"1.2.840.113549.1.1.1\\\"}}\"}"
}
```

Summary Table of Message Types
Message Type	Sender	Content Summary
scanUrl	Client	Repository link
LABEL	Server	Progress text, percentages, module names
GITURL	Server	Confirmed URL
BRANCH	Server	Working branch name
REVISION_HASH	Server	Commit ID
DETECTION	Server	Deep JSON security findings (OIDs, file paths)
