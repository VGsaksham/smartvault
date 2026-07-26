const jobs = new Map();

function createJob(type, userId) {
  const jobId = type + '_' + Date.now() + '_' + Math.random().toString(36).substring(7);
  jobs.set(jobId, {
    id: jobId,
    type, // 'backup' or 'restore'
    status: 'running', // 'running', 'completed', 'failed'
    progress: 0,
    total: 0,
    eta_seconds: null,
    message: 'Starting...',
    created_by: userId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: null,
    error: null,
  });
  return jobId;
}

function updateJobProgress(jobId, processed, total, stage = '') {
  const job = jobs.get(jobId);
  if (!job) return;
  
  job.progress = processed;
  job.total = total;
  job.updated_at = new Date().toISOString();
  
  if (total > 0) {
    const elapsed = Date.now() - new Date(job.created_at).getTime();
    const rate = processed / elapsed;
    const remaining = total - processed;
    job.eta_seconds = rate > 0 ? Math.round((remaining / rate) / 1000) : null;
  }
  
  if (stage) {
    job.message = `Processing ${stage}...`;
  }
}

function completeJob(jobId, result) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'completed';
  job.progress = job.total;
  job.eta_seconds = 0;
  job.result = result;
  job.updated_at = new Date().toISOString();
  job.message = 'Completed successfully';
}

function failJob(jobId, error) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = 'failed';
  job.error = error?.message || String(error);
  job.updated_at = new Date().toISOString();
  job.message = 'Failed: ' + job.error;
}

function getJobStatus(jobId) {
  return jobs.get(jobId) || null;
}

module.exports = {
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  getJobStatus,
};
