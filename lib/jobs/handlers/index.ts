// Side-effect-only barrel: importing this registers every built-in job handler. Import it
// once at the top of any code path that enqueues or processes jobs (cron routes, scripts)
// before calling getJobProvider()/runJob/processPendingJobs.
import "./platform";
import "./retention";
import "./files";
import "./knowledge";
import "./export";
import "./account-deletion";
import "./tool-confirmations";
