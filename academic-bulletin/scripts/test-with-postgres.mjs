import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number(process.env.TEST_DATABASE_PORT || "55432");
const databaseName = process.env.TEST_DATABASE_NAME || "academic_bulletin_test";
const suppliedUrl = process.env.TEST_DATABASE_URL;

if (!databaseName.endsWith("_test")) {
  throw new Error("Refusing to reset a database whose name does not end in '_test'.");
}

function commandWorks(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: false });
  return result.status === 0;
}

function postgresBinary(name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  if (process.env.POSTGRES_BIN) {
    return join(process.env.POSTGRES_BIN, `${name}${extension}`);
  }

  if (commandWorks(name)) return name;

  if (process.platform === "win32") {
    const root = "C:\\Program Files\\PostgreSQL";
    if (existsSync(root)) {
      const versions = readdirSync(root).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true }),
      );
      for (const version of versions) {
        const candidate = join(root, version, "bin", `${name}.exe`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  throw new Error(
    `PostgreSQL tool '${name}' was not found. Set POSTGRES_BIN to PostgreSQL's bin directory.`,
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

const prismaCli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const vitestCli = join(process.cwd(), "node_modules", "vitest", "vitest.mjs");
let startedCluster = false;
let pgCtl;
let dataDirectory;

try {
  let databaseUrl = suppliedUrl;

  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    const suppliedDatabase = parsed.pathname.replace(/^\//, "");
    if (!suppliedDatabase.endsWith("_test")) {
      throw new Error(
        "TEST_DATABASE_URL must reference a database whose name ends in '_test'.",
      );
    }
  } else {
    const initdb = postgresBinary("initdb");
    pgCtl = postgresBinary("pg_ctl");
    const psql = postgresBinary("psql");
    const createdb = postgresBinary("createdb");
    dataDirectory =
      process.env.TEST_POSTGRES_DATA_DIR ||
      join(tmpdir(), "academic-bulletin-vitest-postgres");
    mkdirSync(dataDirectory, { recursive: true });

    if (!existsSync(join(dataDirectory, "PG_VERSION"))) {
      run(initdb, [
        "-D",
        dataDirectory,
        "-U",
        "postgres",
        "--auth=trust",
        "--encoding=UTF8",
        "--no-locale",
      ]);
    }

    const serverProbe = spawnSync(
      psql,
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-tAc",
        "SELECT 1",
      ],
      { stdio: "ignore", shell: false },
    );
    const status = spawnSync(pgCtl, ["status", "-D", dataDirectory], {
      stdio: "ignore",
      shell: false,
    });
    if (serverProbe.status !== 0 && status.status !== 0) {
      run(pgCtl, [
        "start",
        "-D",
        dataDirectory,
        "-l",
        join(dataDirectory, "postgres.log"),
        "-o",
        `-p ${port} -h 127.0.0.1`,
        "-w",
      ]);
      startedCluster = true;
    }

    const databaseExists = spawnSync(
      psql,
      [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-tAc",
        `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
      ],
      { encoding: "utf8", shell: false },
    );
    if (databaseExists.status !== 0) {
      throw new Error(databaseExists.stderr || "Could not query the test database.");
    }
    if (databaseExists.stdout.trim() !== "1") {
      run(createdb, [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        databaseName,
      ]);
    }

    databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}?sslmode=disable`;
  }

  const testEnvironment = {
    ...process.env,
    TEST_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
  };

  run(
    process.execPath,
    [prismaCli, "db", "push", "--force-reset", "--accept-data-loss"],
    { env: testEnvironment },
  );
  run(
    process.execPath,
    [vitestCli, "run", "--maxWorkers=1", ...process.argv.slice(2)],
    { env: testEnvironment },
  );
} finally {
  if (startedCluster && pgCtl && dataDirectory) {
    run(pgCtl, ["stop", "-D", dataDirectory, "-m", "fast", "-w"]);
  }
}
