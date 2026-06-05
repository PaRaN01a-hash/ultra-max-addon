const rateLimits = new Map();

// Clean up expired rate limit entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimits.entries()) {
    if (now > record.resetAt) rateLimits.delete(ip);
  }
}, 5 * 60 * 1000);

function rateLimit(ip, max = 5, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimits.get(ip) || {
    count: 0,
    resetAt: now + windowMs
  };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  rateLimits.set(ip, record);

  return record.count > max;
}

module.exports = {
  rateLimit
};
