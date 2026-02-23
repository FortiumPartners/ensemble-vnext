---
name: playwright-automation-reference
description: Comprehensive reference for production browser automation with Playwright covering Page Object Models, queue-driven architecture, browser profiles, network interception, monitoring, and container scaling.
---

# Playwright Automation Comprehensive Reference

Advanced patterns for production browser automation, RPA, and web scraping at scale.

---

## 1. Page Object Model for Production Automation

Production POMs differ from test POMs. They include self-healing fallback selectors, action retry wrappers, and checkpoint integration.

### Self-Healing POM Base Class

```typescript
import { Page, Locator } from 'playwright';

/**
 * Base class for production page objects. Provides fallback selector
 * resolution and action retry wrappers so subclasses stay concise.
 */
abstract class AutomationPage {
  constructor(protected readonly page: Page) {}

  /**
   * Resolve a locator from an ordered list of selector strategies.
   * Returns the first strategy that finds a visible element.
   */
  protected async resolve(
    strategies: Array<() => Locator>,
    timeout = 5000
  ): Promise<Locator> {
    for (const strategy of strategies) {
      const locator = strategy();
      try {
        await locator.waitFor({ state: 'visible', timeout });
        return locator;
      } catch {
        // Move to next strategy
      }
    }
    throw new Error(
      `Failed to resolve element: none of ${strategies.length} strategies matched`
    );
  }

  /**
   * Click an element with automatic retry on stale element or
   * intercept errors. Re-queries the locator on each attempt.
   */
  protected async safeClick(
    strategies: Array<() => Locator>,
    options: { retries?: number; delayMs?: number } = {}
  ): Promise<void> {
    const { retries = 3, delayMs = 500 } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const locator = await this.resolve(strategies);
        await locator.click();
        return;
      } catch (error) {
        if (attempt === retries) throw error;
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }
    }
  }

  /**
   * Fill an input with automatic retry. Clears the field first
   * to avoid appending to existing content.
   */
  protected async safeFill(
    strategies: Array<() => Locator>,
    value: string,
    options: { retries?: number } = {}
  ): Promise<void> {
    const { retries = 3 } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const locator = await this.resolve(strategies);
        await locator.fill('');
        await locator.fill(value);
        return;
      } catch (error) {
        if (attempt === retries) throw error;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
}
```

### Concrete Page Object Example

```typescript
class LoginPage extends AutomationPage {
  private emailStrategies = [
    () => this.page.getByRole('textbox', { name: /email/i }),
    () => this.page.getByLabel('Email'),
    () => this.page.locator('input[type="email"]'),
    () => this.page.locator('#email'),
  ];

  private passwordStrategies = [
    () => this.page.getByRole('textbox', { name: /password/i }),
    () => this.page.getByLabel('Password'),
    () => this.page.locator('input[type="password"]'),
    () => this.page.locator('#password'),
  ];

  private submitStrategies = [
    () => this.page.getByRole('button', { name: /sign in|log in|submit/i }),
    () => this.page.locator('button[type="submit"]'),
    () => this.page.locator('.login-button'),
  ];

  async login(email: string, password: string): Promise<void> {
    await this.safeFill(this.emailStrategies, email);
    await this.safeFill(this.passwordStrategies, password);
    await this.safeClick(this.submitStrategies);
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.waitForURL(/dashboard|home|account/, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
```

### Page Object with Checkpoint Integration

```typescript
import * as fs from 'fs';

class CheckoutPage extends AutomationPage {
  private checkpointPath: string;

  constructor(page: Page, checkpointDir: string) {
    super(page);
    this.checkpointPath = `${checkpointDir}/checkout-state.json`;
  }

  async addToCart(productId: string): Promise<void> {
    const addButton = await this.resolve([
      () => this.page.getByRole('button', { name: /add to cart/i }),
      () => this.page.locator(`[data-product-id="${productId}"] button`),
    ]);
    await addButton.click();
    await this.checkpoint({ step: 'added_to_cart', productId });
  }

  async fillShipping(address: Record<string, string>): Promise<void> {
    for (const [field, value] of Object.entries(address)) {
      await this.safeFill(
        [
          () => this.page.getByLabel(new RegExp(field, 'i')),
          () => this.page.locator(`[name="${field}"]`),
        ],
        value
      );
    }
    await this.checkpoint({ step: 'shipping_filled', address });
  }

  private async checkpoint(data: Record<string, unknown>): Promise<void> {
    const state = {
      ...data,
      url: this.page.url(),
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(this.checkpointPath, JSON.stringify(state, null, 2));
  }
}
```

---

## 2. Queue-Driven Execution Architecture

### Job Queue to Worker Pool to Browser Instance

```
  Job Source (API, cron, file watcher)
       |
       v
  +-----------+
  | Job Queue |  (BullMQ, p-queue, or database-backed)
  +-----------+
       |
       v (dequeue)
  +----+----+----+
  | W1 | W2 | W3 |  Worker Pool (configurable concurrency)
  +----+----+----+
  |    |    |
  v    v    v
  B1   B2   B3       Browser Instances (one per worker)
```

### BullMQ Integration

```typescript
import { Queue, Worker, Job } from 'bullmq';
import { chromium, Browser } from 'playwright';

interface ScrapeJobData {
  url: string;
  selectors: Record<string, string>;
}

const connection = { host: 'localhost', port: 6379 };

// Producer: enqueue jobs
const scrapeQueue = new Queue<ScrapeJobData>('scrape', { connection });

async function enqueueJob(url: string, selectors: Record<string, string>) {
  await scrapeQueue.add('scrape-page', { url, selectors }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
}

// Consumer: process jobs with dedicated browser per worker
async function startWorker(workerId: string) {
  let browser: Browser;

  const worker = new Worker<ScrapeJobData>(
    'scrape',
    async (job: Job<ScrapeJobData>) => {
      if (!browser?.isConnected()) {
        browser = await chromium.launch({ headless: true });
      }

      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        await page.goto(job.data.url, { timeout: 30000 });

        const results: Record<string, string> = {};
        for (const [name, selector] of Object.entries(job.data.selectors)) {
          const el = page.locator(selector);
          results[name] = await el.textContent() ?? '';
        }

        return results;
      } finally {
        await context.close();
      }
    },
    { connection, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed: ${err.message}`);
  });

  // Cleanup on shutdown
  const shutdown = async () => {
    await worker.close();
    await browser?.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { worker, shutdown };
}
```

### Simple In-Memory Queue (No External Dependencies)

```typescript
import PQueue from 'p-queue';
import { chromium, Browser } from 'playwright';

class AutomationRunner {
  private queue: PQueue;
  private browser: Browser | null = null;

  constructor(concurrency = 4) {
    this.queue = new PQueue({ concurrency });
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
  }

  async enqueue<T>(task: (page) => Promise<T>): Promise<T> {
    if (!this.browser) throw new Error('Runner not started');

    return this.queue.add(async () => {
      const context = await this.browser!.newContext();
      const page = await context.newPage();
      try {
        return await task(page);
      } finally {
        await context.close();
      }
    }) as Promise<T>;
  }

  async shutdown(): Promise<void> {
    await this.queue.onIdle();
    await this.browser?.close();
    this.browser = null;
  }
}

// Usage
const runner = new AutomationRunner(4);
await runner.start();

const urls = ['https://example.com/page1', 'https://example.com/page2'];
const results = await Promise.all(
  urls.map((url) =>
    runner.enqueue(async (page) => {
      await page.goto(url);
      return page.title();
    })
  )
);

await runner.shutdown();
```

---

## 3. Browser Profile Management

### Persistent Contexts with User Data Directories

A persistent context writes all browser state (cookies, localStorage, IndexedDB, service workers, cache) to a directory on disk. This is the most complete way to maintain state between runs.

```typescript
import { chromium } from 'playwright';

async function launchWithProfile(profileDir: string) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 40.7128, longitude: -74.006 },
    permissions: ['geolocation'],
    // Block unnecessary resources for faster automation
    bypassCSP: true,
  });

  return context;
}
```

### Cookie Jar Management

```typescript
import * as fs from 'fs';

const COOKIE_JAR_PATH = './cookies';

async function saveCookies(context, domain: string): Promise<void> {
  const cookies = await context.cookies();
  const domainCookies = cookies.filter(
    (c) => c.domain.includes(domain)
  );

  fs.mkdirSync(COOKIE_JAR_PATH, { recursive: true });
  fs.writeFileSync(
    `${COOKIE_JAR_PATH}/${domain}.json`,
    JSON.stringify(domainCookies, null, 2)
  );
}

async function loadCookies(context, domain: string): Promise<boolean> {
  const cookiePath = `${COOKIE_JAR_PATH}/${domain}.json`;
  if (!fs.existsSync(cookiePath)) return false;

  const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
  await context.addCookies(cookies);
  return true;
}

async function clearCookies(context, domain?: string): Promise<void> {
  if (domain) {
    const cookies = await context.cookies();
    const filtered = cookies.filter((c) => !c.domain.includes(domain));
    await context.clearCookies();
    if (filtered.length > 0) {
      await context.addCookies(filtered);
    }
  } else {
    await context.clearCookies();
  }
}
```

### Multi-Profile Rotation

For automation that requires multiple accounts or identities, rotate through profiles to distribute load and reduce rate limiting.

```typescript
class ProfilePool {
  private profiles: string[];
  private currentIndex = 0;

  constructor(profileDirs: string[]) {
    this.profiles = profileDirs;
  }

  next(): string {
    const profile = this.profiles[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.profiles.length;
    return profile;
  }

  async launchNext() {
    const profileDir = this.next();
    return chromium.launchPersistentContext(profileDir, { headless: true });
  }
}
```

---

## 4. Network Interception for Stability

### Block Unnecessary Resources

Blocking images, fonts, and analytics reduces page load time and bandwidth in automation scenarios where visual rendering is not required.

```typescript
async function setupResourceBlocking(page): Promise<void> {
  await page.route('**/*', (route) => {
    const resourceType = route.request().resourceType();
    const blockedTypes = ['image', 'media', 'font', 'stylesheet'];

    if (blockedTypes.includes(resourceType)) {
      return route.abort();
    }

    // Block known analytics/tracking domains
    const blockedDomains = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.net',
      'doubleclick.net',
      'hotjar.com',
    ];

    const url = route.request().url();
    if (blockedDomains.some((domain) => url.includes(domain))) {
      return route.abort();
    }

    return route.continue();
  });
}
```

### Request and Response Modification

```typescript
// Add custom headers to all outgoing requests
async function addCustomHeaders(
  page,
  headers: Record<string, string>
): Promise<void> {
  await page.route('**/*', (route) => {
    route.continue({
      headers: {
        ...route.request().headers(),
        ...headers,
      },
    });
  });
}

// Intercept and modify API responses (useful for testing edge cases)
async function interceptApiResponse(
  page,
  urlPattern: string,
  modifier: (body: unknown) => unknown
): Promise<void> {
  await page.route(urlPattern, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const modified = modifier(body);

    await route.fulfill({
      response,
      body: JSON.stringify(modified),
      headers: {
        ...response.headers(),
        'content-type': 'application/json',
      },
    });
  });
}
```

### Rate Limiting Outgoing Requests

```typescript
class RequestThrottler {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  async throttle(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(
      (t) => now - t < this.windowMs
    );

    if (this.timestamps.length >= this.maxRequests) {
      const oldestInWindow = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestInWindow);
      await new Promise((r) => setTimeout(r, waitTime));
    }

    this.timestamps.push(Date.now());
  }
}

// Usage: limit to 10 page navigations per minute
const throttler = new RequestThrottler(10, 60000);

async function throttledGoto(page, url: string): Promise<void> {
  await throttler.throttle();
  await page.goto(url);
}
```

---

## 5. Monitoring and Alerting

### Execution Metrics Tracking

```typescript
interface AutomationMetrics {
  jobId: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'running' | 'success' | 'failed';
  error?: string;
  stepsCompleted: number;
  totalSteps: number;
  retryCount: number;
}

class MetricsCollector {
  private metrics: Map<string, AutomationMetrics> = new Map();

  start(jobId: string, totalSteps: number): void {
    this.metrics.set(jobId, {
      jobId,
      startTime: Date.now(),
      status: 'running',
      stepsCompleted: 0,
      totalSteps,
      retryCount: 0,
    });
  }

  stepCompleted(jobId: string): void {
    const m = this.metrics.get(jobId);
    if (m) m.stepsCompleted++;
  }

  retried(jobId: string): void {
    const m = this.metrics.get(jobId);
    if (m) m.retryCount++;
  }

  complete(jobId: string): void {
    const m = this.metrics.get(jobId);
    if (m) {
      m.status = 'success';
      m.endTime = Date.now();
      m.durationMs = m.endTime - m.startTime;
    }
  }

  fail(jobId: string, error: string): void {
    const m = this.metrics.get(jobId);
    if (m) {
      m.status = 'failed';
      m.endTime = Date.now();
      m.durationMs = m.endTime - m.startTime;
      m.error = error;
    }
  }

  getSummary(): {
    total: number;
    succeeded: number;
    failed: number;
    avgDurationMs: number;
    totalRetries: number;
  } {
    const all = Array.from(this.metrics.values()).filter((m) => m.endTime);
    const succeeded = all.filter((m) => m.status === 'success');
    const failed = all.filter((m) => m.status === 'failed');
    const avgDuration =
      all.length > 0
        ? all.reduce((sum, m) => sum + (m.durationMs ?? 0), 0) / all.length
        : 0;

    return {
      total: all.length,
      succeeded: succeeded.length,
      failed: failed.length,
      avgDurationMs: Math.round(avgDuration),
      totalRetries: all.reduce((sum, m) => sum + m.retryCount, 0),
    };
  }
}
```

### Screenshot Archival

```typescript
import * as fs from 'fs';
import * as path from 'path';

class ScreenshotArchive {
  private archiveDir: string;
  private maxFiles: number;

  constructor(archiveDir: string, maxFiles = 500) {
    this.archiveDir = archiveDir;
    this.maxFiles = maxFiles;
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  async capture(
    page,
    label: string,
    options: { fullPage?: boolean } = {}
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${label}.png`;
    const filepath = path.join(this.archiveDir, filename);

    await page.screenshot({
      path: filepath,
      fullPage: options.fullPage ?? false,
    });

    await this.pruneOldFiles();
    return filepath;
  }

  private async pruneOldFiles(): Promise<void> {
    const files = fs
      .readdirSync(this.archiveDir)
      .filter((f) => f.endsWith('.png'))
      .sort();

    while (files.length > this.maxFiles) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(this.archiveDir, oldest));
    }
  }
}
```

### Alerting on Failure Threshold

```typescript
interface AlertConfig {
  failureThreshold: number;
  windowMinutes: number;
  onAlert: (summary: { failures: number; window: number }) => void;
}

class FailureMonitor {
  private failures: number[] = [];
  private config: AlertConfig;
  private alerted = false;

  constructor(config: AlertConfig) {
    this.config = config;
  }

  recordFailure(): void {
    const now = Date.now();
    const windowMs = this.config.windowMinutes * 60000;

    this.failures.push(now);
    this.failures = this.failures.filter((t) => now - t < windowMs);

    if (this.failures.length >= this.config.failureThreshold && !this.alerted) {
      this.alerted = true;
      this.config.onAlert({
        failures: this.failures.length,
        window: this.config.windowMinutes,
      });
    }
  }

  recordSuccess(): void {
    // Reset alert state on success
    this.alerted = false;
  }
}

// Usage
const monitor = new FailureMonitor({
  failureThreshold: 5,
  windowMinutes: 10,
  onAlert: ({ failures, window }) => {
    console.error(
      `ALERT: ${failures} failures in ${window} minutes. Pausing automation.`
    );
    // Send webhook, email, Slack notification, etc.
  },
});
```

---

## 6. Scaling with Container-Based Workers

### Docker with Playwright

```dockerfile
# Dockerfile
FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# Run as non-root for security
USER pwuser

# Resource limits are set via container orchestration,
# not in the Dockerfile itself
CMD ["node", "worker.js"]
```

### Docker Compose for Worker Pool

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis-data:/data

  worker:
    build: .
    deploy:
      replicas: 4
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G
    environment:
      - REDIS_URL=redis://redis:6379
      - CONCURRENCY=2
      - HEADLESS=true
    depends_on:
      - redis
    # Shared memory size must be increased for Chromium
    shm_size: '1gb'

  dashboard:
    build: .
    command: node dashboard.js
    ports:
      - '3000:3000'
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

volumes:
  redis-data:
```

### Headless Configuration for Containers

```typescript
import { chromium } from 'playwright';

async function launchForContainer() {
  return chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',    // Use /tmp instead of /dev/shm
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
    ],
  });
}
```

### Health Check Endpoint

```typescript
import http from 'http';

function startHealthCheck(
  port: number,
  checkFn: () => Promise<boolean>
): http.Server {
  const server = http.createServer(async (_req, res) => {
    try {
      const healthy = await checkFn();
      res.writeHead(healthy ? 200 : 503);
      res.end(JSON.stringify({ status: healthy ? 'ok' : 'unhealthy' }));
    } catch {
      res.writeHead(503);
      res.end(JSON.stringify({ status: 'error' }));
    }
  });

  server.listen(port, () => {
    console.log(`Health check listening on port ${port}`);
  });

  return server;
}

// Usage with Docker health check
// HEALTHCHECK CMD curl -f http://localhost:8080/ || exit 1
startHealthCheck(8080, async () => {
  // Verify browser can launch
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  return true;
});
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: playwright-workers
spec:
  replicas: 4
  selector:
    matchLabels:
      app: playwright-worker
  template:
    metadata:
      labels:
        app: playwright-worker
    spec:
      containers:
        - name: worker
          image: your-registry/playwright-worker:latest
          resources:
            requests:
              cpu: '500m'
              memory: '1Gi'
            limits:
              cpu: '1000m'
              memory: '2Gi'
          # /dev/shm must be large enough for Chromium
          volumeMounts:
            - name: dshm
              mountPath: /dev/shm
          livenessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
      volumes:
        - name: dshm
          emptyDir:
            medium: Memory
            sizeLimit: 1Gi
```

---

**See [SKILL.md](./SKILL.md) for**: Core patterns, selector strategy, session persistence, retry wrappers, anti-flake techniques, and Playwright 1.56 agents overview.
