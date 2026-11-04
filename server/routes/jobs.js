import { requireUser } from '../services/auth.js';
import { dismissJob, listJobs } from '../services/activity-jobs.js';

export async function registerJobRoutes(app) {
  app.get('/api/v1/jobs', async (req) => {
    const user = requireUser(req);
    return { jobs: listJobs(user.id) };
  });

  app.delete('/api/v1/jobs/:id', async (req) => {
    const user = requireUser(req);
    dismissJob(user.id, req.params.id);
    return { ok: true };
  });
}
