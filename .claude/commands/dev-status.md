Probe all ClaudeKit app ports and report which are running or stopped.

Check each of these ports by attempting a TCP connection (e.g. `curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:<port>`):

| App | Port |
|-----|------|
| Web | 2000 |
| Gadget | 2100 |
| Inside | 2150 |
| GoGo Web | 2200 |
| GoGo Orchestrator | 2201 |
| B4U | 2300 |
| Inspector | 2400 |

For each app, report whether it responded (running) or timed out / refused connection (stopped).

Present the results as a table with columns: App, Port, Status.
