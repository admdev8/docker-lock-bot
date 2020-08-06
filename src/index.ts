import util from 'util'
import * as child from 'child_process'

// @ts-ignore
import createScheduler from 'probot-scheduler'
import { Application, Context, Octokit } from 'probot' // eslint-disable-line no-unused-vars

import { v4 as uuidv4 } from 'uuid'

const SCHEDULER_INTERVAL_MS: number = +(process.env.SCHEDULER_INTERVAL_MS || 5 * 60 * 1000) // default to 5 minutes
const SCHEDULER_DELAY = true // when true, random delay between 0 and interval to avoid all schedules being performed at the same time

const UPDATE_BRANCH = 'add-docker-lock' // name of branch created/updated on Github

async function createToken (context: Context, app: Application): Promise<string> {
  // https://github.com/probot/probot/issues/1003
  const auth = await app.auth()
  const resp = await auth.apps.createInstallationToken({ installation_id: context.payload.installation.id })

  return resp.data.token
}

async function getDefaultBranch (context: Context, owner: string, repo: string): Promise<string> {
  const { default_branch } = (await context.github.repos.get({ owner, repo })).data // eslint-disable-line camelcase
  return default_branch // eslint-disable-line camelcase
}

function getRepo (context: Context): string {
  const { repo } = context.repo()
  return repo
}

function getOwner (context: Context): string {
  const { owner } = context.repo()
  return owner
}

async function dockerLock (token: string, owner: string, repo: string, defaultBranch: string): Promise<{ stdout: string, stderr: string }> {
  const exec = util.promisify(child.exec)
  const { stdout, stderr } = await exec(`bash ./docker-lock.sh ${token} ${owner} ${repo} ${defaultBranch}`)

  return { stdout, stderr }
}

async function deleteBranch (context: Context, owner: string, repo: string, updateBranch: string) {
  await context.github.git.deleteRef({
    owner: owner,
    repo: repo,
    ref: `heads/${updateBranch}`
  })
}

async function createPR (context: Context, owner: string, repo: string, defaultBranch: string, updateBranch: string): Promise<Octokit.Response<Octokit.PullsCreateResponse>> {
  const resp = context.github.pulls.create({
    owner: owner,
    repo: repo,
    title: '🐳🔐🤖',
    body: 'Updated Lockfile.',
    head: updateBranch,
    base: defaultBranch,
    maintainer_can_modify: true
  })

  return resp
}

async function PRExists (context: Context, owner: string, repo: string, defaultBranch: string, updateBranch: string): Promise<boolean> {
  const pulls = await context.github.pulls.list({
    owner: owner,
    repo: repo,
    state: 'open',
    head: `${owner}:${updateBranch}`,
    base: defaultBranch
  })

  return pulls.data.length !== 0
}

export = (app: Application) => {
  createScheduler(app, {
    delay: SCHEDULER_DELAY,
    interval: SCHEDULER_INTERVAL_MS
  })

  app.on('pull_request.closed', async (context: Context) => {
    const repo = getRepo(context)
    const owner = getOwner(context)

    await deleteBranch(context, owner, repo, UPDATE_BRANCH)
  })

  // https://github.com/probot/scheduler
  app.on('schedule.repository', async (context: Context) => {
    const traceIdentifier = uuidv4()

    const token = await createToken(context, app)

    const owner = getOwner(context)
    const repo = getRepo(context)
    const defaultBranch = await getDefaultBranch(context, owner, repo)

    app.log(traceIdentifier, owner, repo, 'Beginning docker lock')

    let commitOccurred = false
    try {
      const { stdout, stderr } = await dockerLock(token, owner, repo, defaultBranch)
      app.log(traceIdentifier, owner, repo, stdout, stderr, 'Finished docker lock')
      commitOccurred = stdout === 'true'
    } catch (e) {
      app.log(traceIdentifier, owner, repo, 'docker-lock failed', e)
      return
    }

    if (!commitOccurred) {
      // TODO: A more robust method would be to check for a diff, rather than if a commit occured.
      app.log(traceIdentifier, owner, repo, 'no commit occurred')
      return
    }

    if (!await PRExists(context, owner, repo, defaultBranch, UPDATE_BRANCH)) {
      try {
        const pr = await createPR(context, owner, repo, defaultBranch, UPDATE_BRANCH)
        app.log(traceIdentifier, owner, repo, 'created PR', pr)
      } catch (e) {
        app.log(traceIdentifier, owner, repo, e)
      }
    } else {
      app.log(traceIdentifier, owner, repo, 'PR already exists')
    }
  })
}
