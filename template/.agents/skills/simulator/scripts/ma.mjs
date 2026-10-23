#!/usr/bin/env node
// ma - drive a booted iOS simulator through the AXe CLI.
//
// Five commands over `axe`, each one adding something `axe` does not do:
// compacted describe-ui, waiting on a state instead of sleeping, recovery when the
// accessibility bridge dies, and a tap that survives Flutter reporting one widget
// as several accessibility nodes.
//
// Nothing here is app specific. The simulator is resolved from whatever is booted and
// every selector comes from the running app's accessibility tree, so the same binary
// drives any Flutter app. How to launch the app is the project's business, not this file's.
//
// Requires AXe 1.8.0 or newer: brew install cameroncooke/axe/axe

import { spawn } from "node:child_process";
import fs from "node:fs";

// --- process helpers ---------------------------------------------------------

const runProcess = (command, args, timeoutMs) => new Promise((resolve, reject) => {
  const proc = spawn(command, args, { timeout: timeoutMs });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (callback) => {
    if (settled) return;
    settled = true;
    callback();
  };
  proc.stdout.on("data", (data) => { stdout += data.toString(); });
  proc.stderr.on("data", (data) => { stderr += data.toString(); });
  proc.on("close", (code, closeSignal) => finish(() => {
    const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
    if (code === 0) return resolve(combined || "(no output)");
    const reason = closeSignal ? `signal ${closeSignal}` : `exit ${code ?? "unknown"}`;
    reject(new Error(`${command} ${args[0] ?? ""} failed (${reason})${combined ? `\n${combined}` : ""}`));
  }));
  proc.on("error", (error) => finish(() => reject(error)));
});

const runAxeOnce = (args, timeoutMs) => runProcess("axe", args, timeoutMs);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const push = (args, flag, value) => {
  if (value !== undefined && value !== null) args.push(flag, String(value));
};

// --- accessibility transport recovery ----------------------------------------

// The simulator's accessibility bridge dies mid session and every later command fails
// with one of these. Restarting testmanagerd fixes it; rebooting fixes the rest.
const translationFailureMarkers = [
  "No translation object returned for simulator",
  "Accessibility translation dispatcher is unavailable",
];

const isTranslationFailure = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return translationFailureMarkers.some((marker) => message.includes(marker));
};

// Only retry what is safe to run twice. A describe is idempotent; a tap by coordinate
// is not, and neither is anything that already moved the app forward.
const shouldRecoverAccessibility = (args) => {
  const command = args[0];
  if (command === "describe-ui") return !args.includes("--point");
  return command === "tap" && ["--id", "--label", "--value"].some((selector) => args.includes(selector));
};

const activeApplicationBundleId = async (udid) => {
  try {
    const output = await runProcess("/bin/ps", ["-axo", "pid=,stat=,command="], 5000);
    const deviceRoot = `/Library/Developer/CoreSimulator/Devices/${udid}/data/Containers/Bundle/Application/`;
    const candidates = output.split("\n").flatMap((line) => {
      const deviceRootIndex = line.indexOf(deviceRoot);
      const bundleEnd = line.indexOf(".app/", deviceRootIndex);
      const bundleStart = line.lastIndexOf(" /", deviceRootIndex);
      if (deviceRootIndex < 0 || bundleStart < 0 || bundleEnd < 0) return [];

      const [pidText = "0", status = ""] = line.slice(0, bundleStart).trim().split(/\s+/, 2);
      if (status.includes("T") || status.includes("Z")) return [];
      return [{
        bundlePath: line.slice(bundleStart + 1, bundleEnd + 4),
        pid: Number(pidText),
        rank: status.startsWith("R") ? 0 : 1,
      }];
    }).sort((left, right) => left.rank - right.rank || right.pid - left.pid);

    for (const candidate of candidates) {
      try {
        const bundleId = (await runProcess(
          "/usr/bin/plutil",
          ["-extract", "CFBundleIdentifier", "raw", "-o", "-", `${candidate.bundlePath}/Info.plist`],
          5000,
        )).trim();
        const normalized = bundleId.toLowerCase();
        // A test runner is not the app under test, and relaunching one strands the session.
        if (!normalized.includes("maestro") && !normalized.endsWith(".xctrunner")) return bundleId;
      } catch {
        // Try the next active user application.
      }
    }
  } catch {
    // Recovery still works without relaunching the foreground application.
  }
  return undefined;
};

const probeAccessibility = (udid) => runAxeOnce(["describe-ui", "--udid", udid], 15000);

const recoverSimulatorAccessibility = async (udid) => {
  try {
    await runProcess(
      "/usr/bin/xcrun",
      ["simctl", "spawn", udid, "launchctl", "kickstart", "-k", "user/foreground/com.apple.testmanagerd"],
      10000,
    );
    await delay(350);
    await probeAccessibility(udid);
    return;
  } catch (error) {
    if (!isTranslationFailure(error)) throw error;
  }

  const bundleId = await activeApplicationBundleId(udid);
  await runProcess("/usr/bin/xcrun", ["simctl", "shutdown", udid], 30000);
  await runProcess("/usr/bin/xcrun", ["simctl", "boot", udid], 30000);
  try {
    await runProcess("/usr/bin/open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", udid], 10000);
  } catch {
    // AXe can still use a booted simulator when Simulator.app cannot be opened.
  }
  await runProcess("/usr/bin/xcrun", ["simctl", "bootstatus", udid, "-b"], 120000);
  if (bundleId) {
    try {
      await runProcess("/usr/bin/xcrun", ["simctl", "launch", udid, bundleId], 30000);
      await delay(750);
    } catch {
      // Fall back to the booted home screen if the previous app cannot be relaunched.
    }
  }
  await probeAccessibility(udid);
};

const accessibilityRecoveries = new Map();

const coordinatedAccessibilityRecovery = (udid) => {
  const existing = accessibilityRecoveries.get(udid);
  if (existing) return existing;

  const recovery = recoverSimulatorAccessibility(udid);
  accessibilityRecoveries.set(udid, recovery);
  void recovery.finally(() => {
    if (accessibilityRecoveries.get(udid) === recovery) accessibilityRecoveries.delete(udid);
  }).catch(() => {});
  return recovery;
};

const runAxe = async (args, timeoutMs = 30000) => {
  try {
    return await runAxeOnce(args, timeoutMs);
  } catch (error) {
    const udidIndex = args.indexOf("--udid");
    const udid = udidIndex >= 0 ? args[udidIndex + 1] : undefined;
    if (!udid || !shouldRecoverAccessibility(args) || !isTranslationFailure(error)) throw error;

    try {
      await coordinatedAccessibilityRecovery(udid);
    } catch (recoveryError) {
      const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${originalMessage}\nautomatic simulator accessibility recovery failed\n${recoveryMessage}`);
    }
    return runAxeOnce(args, timeoutMs);
  }
};

// --- output compaction -------------------------------------------------------

/**
 * Flatten AXe's tree into minified selector-first records. A real screen is ~160 KB of
 * raw JSON, which does not survive two describes in one context window.
 *
 * Keys: i=id, l=label, t=type code, e=0 disabled, v=value,
 * p=[centerX,centerY] for ambiguous/unselectable visible elements.
 * Offscreen/zero-size nodes are omitted; scroll and describe again to reveal them.
 */
const compactDescribeUi = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    const nodes = [];
    const flatten = (node) => {
      nodes.push(node);
      const children = node.children;
      if (Array.isArray(children)) {
        for (const child of children) {
          if (typeof child === "object" && child !== null) flatten(child);
        }
      }
    };
    for (const node of parsed) flatten(node);

    const visibleNodes = nodes.filter((node) => {
      if (typeof node.frame !== "object" || node.frame === null) return true;
      const frame = node.frame;
      return (typeof frame.width !== "number" || frame.width > 0) &&
        (typeof frame.height !== "number" || frame.height > 0);
    });
    const count = (field) => {
      const counts = new Map();
      for (const node of visibleNodes) {
        const value = node[field];
        if (typeof value === "string" && value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return counts;
    };
    const idCounts = count("AXUniqueId");
    const labelCounts = count("AXLabel");
    const typeCodes = {
      Button: "b",
      Heading: "h",
      StaticText: "t",
      GenericElement: "g",
      ScrollArea: "s",
      TextField: "f",
      Switch: "w",
      Slider: "r",
      Checkbox: "c",
      CheckBox: "c",
      Link: "a",
      Image: "m",
    };
    const actionable = new Set(["Button", "TextField", "Switch", "Slider", "Checkbox", "CheckBox", "Link"]);

    // Scroll indicators are never actionable, and an open keyboard contributes ~40
    // single-character keys. Both are pure noise in every single snapshot. The keys
    // that are actually used (Done, delete, shift, space, more, emoji) carry an
    // AXUniqueId, so keeping id-bearing nodes preserves them.
    const scrollIndicator = /^(Vertical|Horizontal) scroll bar, \d+ page/;
    const keyboardOpen = visibleNodes.some((node) => String(node.AXUniqueId ?? "").includes("UIKeyboardLayout"));

    const compact = visibleNodes.flatMap((node) => {
      const type = typeof node.type === "string" ? node.type : "";
      if (type === "Application") return [];

      const rawLabel = String(node.AXLabel ?? node.title ?? "");
      if (scrollIndicator.test(rawLabel)) return [];
      if (keyboardOpen && !node.AXUniqueId && [...rawLabel].length === 1) return [];

      const id = typeof node.AXUniqueId === "string" && node.AXUniqueId ? node.AXUniqueId : undefined;
      const labelValue = node.AXLabel ?? node.title;
      const label = typeof labelValue === "string" && labelValue ? labelValue : undefined;
      const value = node.AXValue;
      if (!id && !label && value == null && !actionable.has(type) && type !== "ScrollArea") return [];

      const hasFrame = typeof node.frame === "object" && node.frame !== null;
      const frame = hasFrame ? node.frame : {};
      const x = typeof frame.x === "number" ? frame.x : 0;
      const y = typeof frame.y === "number" ? frame.y : 0;
      const width = typeof frame.width === "number" ? frame.width : 0;
      const height = typeof frame.height === "number" ? frame.height : 0;
      const result = {};
      if (id) result.i = id;
      if (label) result.l = label;
      if (type) result.t = typeCodes[type] ?? type;
      if (node.enabled === false) result.e = 0;
      if (value != null) result.v = value;
      if (
        (id && (idCounts.get(id) ?? 0) > 1) ||
        (!id && label && (labelCounts.get(label) ?? 0) > 1) ||
        (!id && !label && actionable.has(type))
      ) {
        result.p = [Math.round(x + width / 2), Math.round(y + height / 2)];
      }

      return [result];
    });

    return JSON.stringify(compact);
  } catch {
    return raw;
  }
};

const compactSimulators = (raw, includeShutdown) => raw
  .split("\n")
  .map((line) => line.split("|").map((part) => part.trim()))
  .filter((parts) => parts.length >= 5)
  .map(([udid, name, state, _model, os]) => ({
    u: udid,
    n: name,
    s: state.toLowerCase(),
    os: os.replace(/^OS\s+'|'+$/g, ""),
  }))
  .filter((simulator) => includeShutdown || simulator.s === "booted")
  .sort((left, right) => Number(right.s === "booted") - Number(left.s === "booted"));

// --- UI snapshot cache -------------------------------------------------------

// `wait --changed` has to compare against the screen as it was *before* the action
// that preceded it. Every describe therefore records its result, so the next wait
// can baseline on it instead of on its own first poll, which is already too late.
const uiCachePath = (deviceUdid) => `/tmp/ma-ui-${deviceUdid}.json`;
const uiCacheMaxAgeMs = 60000;

const describeUi = async (deviceUdid, extraArgs = []) => {
  const compact = compactDescribeUi(await runAxe(["describe-ui", "--udid", deviceUdid, ...extraArgs]));
  // Point queries describe a single element, not the screen; they must not become a baseline.
  if (extraArgs.length === 0) {
    try {
      fs.writeFileSync(uiCachePath(deviceUdid), compact);
    } catch {
      // A missing cache only costs the wait its first poll.
    }
  }
  return compact;
};

const cachedUi = (deviceUdid) => {
  try {
    const path = uiCachePath(deviceUdid);
    if (Date.now() - fs.statSync(path).mtimeMs > uiCacheMaxAgeMs) return undefined;
    return fs.readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

// --- ambiguous selector resolution -------------------------------------------

// AXe refuses a selector that matches several nodes. Flutter routinely reports one
// widget as several, and when those nodes are one widget they share a center, which
// the compact output already carries (`p` is emitted precisely for ambiguous matches).
const unambiguousPoint = async (error, params) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!/Multiple \(\d+\) accessibility elements matched/.test(message)) return undefined;

  const nodes = JSON.parse(await describeUi(params.udid));
  const candidates = nodes.filter((node) => {
    if (params.id !== undefined && node.i !== params.id) return false;
    if (params.label !== undefined && node.l !== params.label) return false;
    if (params.value !== undefined && String(node.v ?? "") !== params.value) return false;
    return params.id !== undefined || params.label !== undefined || params.value !== undefined;
  });

  const points = [...new Set(candidates.filter((node) => node.p).map((node) => JSON.stringify(node.p)))];
  if (points.length !== 1) return undefined;
  return JSON.parse(points[0]);
};

// --- screen geometry ---------------------------------------------------------

// The Application root carries the logical screen size, so gestures can be expressed
// in fractions instead of numbers hardcoded for one device.
const screenSize = async (deviceUdid) => {
  const raw = await runAxe(["describe-ui", "--udid", deviceUdid]);
  const frame = JSON.parse(raw)[0]?.frame ?? {};
  const width = typeof frame.width === "number" ? frame.width : 0;
  const height = typeof frame.height === "number" ? frame.height : 0;
  if (!width || !height) throw new Error("could not read the screen size from describe-ui");
  return { width, height };
};

// --- gestures ----------------------------------------------------------------

// Every preset here is an explicit swipe rather than `axe gesture <preset>`.
// Verified on iOS 26.5: the AXe presets exit 0 and leave the screen untouched,
// while the same movement as a swipe works every time. Silent no-ops are worse
// than errors, and `wait --scroll` is built on top of this.
const swipePreset = async (deviceUdid, preset, options = {}) => {
  const { width, height } = await screenSize(deviceUdid);
  const midX = Math.round(width / 2);
  const midY = Math.round(height / 2);
  const near = Math.round(height * 0.25);
  const far = Math.round(height * 0.75);
  const nearX = Math.round(width * 0.2);
  const farX = Math.round(width * 0.8);

  // A scroll moves the finger opposite to the content: scroll-down reveals what is
  // below, so the finger travels up.
  const swipes = {
    "scroll-down": [midX, far, midX, near],
    "scroll-up": [midX, near, midX, far],
    "scroll-left": [farX, midY, nearX, midY],
    "scroll-right": [nearX, midY, farX, midY],
    "swipe-from-left-edge": [2, midY, Math.round(width * 0.85), midY],
    "swipe-from-right-edge": [width - 2, midY, Math.round(width * 0.15), midY],
    "swipe-from-top-edge": [midX, 2, midX, Math.round(height * 0.6)],
    "swipe-from-bottom-edge": [midX, height - 2, midX, Math.round(height * 0.4)],
  };
  const [startX, startY, endX, endY] = swipes[preset];

  const args = [
    "swipe", "--udid", deviceUdid,
    "--start-x", String(startX), "--start-y", String(startY),
    "--end-x", String(endX), "--end-y", String(endY),
    "--duration", String(options.duration ?? 0.4),
  ];
  push(args, "--pre-delay", options.pre_delay);
  push(args, "--post-delay", options.post_delay);
  return runAxe(args);
};

// --- foreground detection ----------------------------------------------------

// SpringBoard's own windows are unmistakable, and while one of them owns the display
// the app under test is simply not on screen. Waiting it out never helps.
// Both markers observed directly on iOS 26.5; do not add unverified ones, a false
// positive here turns a working wait into a hard failure.
const springboardMarkers = {
  "SBSwitcherWindow": "the app switcher",
  "Home screen icons": "the iOS home screen",
};

const springboardOwner = (nodes) => {
  for (const node of nodes) {
    const id = typeof node.i === "string" ? node.i : "";
    for (const [marker, description] of Object.entries(springboardMarkers)) {
      if (id.includes(marker)) return description;
    }
  }
  return undefined;
};

// A point query hit-tests what is drawn, which the full tree does not always reflect.
// Observed: describe-ui still listing SBSwitcherWindow while the app was already up
// showing a permission prompt. Only SpringBoard content at the centre confirms it.
const springboardConfirmed = async (deviceUdid) => {
  try {
    const { width, height } = await screenSize(deviceUdid);
    const raw = await runAxe(
      ["describe-ui", "--udid", deviceUdid, "--point", `${Math.round(width / 2)},${Math.round(height / 2)}`],
    );
    return springboardOwner([{ i: JSON.parse(raw).AXUniqueId ?? "" }]) !== undefined;
  } catch {
    return false;
  }
};

// --- commands ----------------------------------------------------------------

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const int = (description) => ({ type: "integer", description });
const num = (description) => ({ type: "number", description });
const bool = (description) => ({ type: "boolean", description });
const enumOf = (values, description) => ({ type: "string", enum: values, description });
const schema = (properties, required = []) => ({ type: "object", properties, required });

const udid = str("Target simulator. Defaults to the only booted one.");

const commands = [
  {
    name: "list-simulators",
    summary: "List booted simulators as compact JSON.",
    inputSchema: schema({ include_shutdown: bool("Include shutdown simulators.") }),
    async run(params) {
      const raw = await runAxe(["list-simulators"]);
      return JSON.stringify(compactSimulators(raw, params.include_shutdown ?? false));
    },
  },
  {
    name: "describe-ui",
    summary: "Visible UI as minified flat JSON. i=id, l=label, t=type, e=0 disabled, v=value, p=[x,y] when ambiguous.",
    inputSchema: schema({
      udid,
      point: str("Inspect only the element at an X,Y coordinate (e.g. '100,200')."),
    }, ["udid"]),
    run: (params) => describeUi(params.udid, params.point ? ["--point", params.point] : []),
  },
  {
    name: "wait",
    summary: "Poll describe-ui until the screen satisfies a condition, then print it. Replaces a blind sleep.",
    inputSchema: schema({
      udid,
      id: { type: "array", items: { type: "string" }, description: "Wait for an element whose id matches exactly. Repeat to accept any of several." },
      label: { type: "array", items: { type: "string" }, description: "Wait for an element whose label contains this, case-insensitive. Repeat to accept any of several." },
      value: str("Require the matched element's value to equal this."),
      enabled: bool("Require the matched element to be enabled."),
      gone: bool("Invert: wait until nothing matches."),
      changed: bool("Wait until the screen differs from the last describe this CLI recorded."),
      scroll: enumOf(["scroll-up", "scroll-down"], "Scroll this way between polls. Offscreen nodes never appear on their own."),
      timeout: num("Seconds before failing (default: 15)."),
      interval: num("Seconds between polls (default: 0.3)."),
    }, ["udid"]),
    async run(params) {
      const ids = params.id ?? [];
      const labels = (params.label ?? []).map((text) => text.toLowerCase());
      const { value, enabled, gone, changed } = params;
      if (!ids.length && !labels.length && !changed) throw new Error("wait requires a selector (--id or --label) or --changed");

      // Selectors are alternatives: any id or any label wins. value and enabled are
      // constraints on whichever node matched, not selectors of their own.
      const matches = (node) => {
        const selected = ids.includes(node.i) ||
          labels.some((text) => String(node.l ?? "").toLowerCase().includes(text));
        if (!selected) return false;
        if (value !== undefined && String(node.v ?? "") !== value) return false;
        if (enabled && node.e === 0) return false;
        return true;
      };

      const timeoutMs = (params.timeout ?? 15) * 1000;
      const intervalMs = (params.interval ?? 0.3) * 1000;
      const deadline = Date.now() + timeoutMs;

      // Baseline from the previous command's describe, not from our own first poll:
      // by the time we poll, the transition we are waiting on may already be over.
      let baseline = changed ? cachedUi(params.udid) : undefined;
      const hadBaseline = baseline !== undefined;
      const selectorText = () => [ids.length && `id ${ids.join("|")}`, labels.length && `label ${labels.join("|")}`]
        .filter(Boolean).join(" or ");
      let barrenScrolls = 0;
      let lastBeforeScroll;
      let polls = 0;
      let unconfirmedSpringboard;
      for (;;) {
        const compact = await describeUi(params.udid);
        polls += 1;
        if (baseline === undefined) baseline = compact;

        // No app screen can appear while SpringBoard owns the display, so polling on
        // is guaranteed waste. Fail now with the reason instead of at the deadline.
        const springboard = springboardOwner(JSON.parse(compact));
        // The full tree can go stale and keep describing the app switcher while the app
        // is already drawing again, so confirm against what is actually on screen before
        // turning this into a hard failure.
        if (springboard && !gone) {
          if (await springboardConfirmed(params.udid)) {
            throw new Error(
              `${springboard} is in the foreground, not the app: no app screen can match. ` +
              "Relaunch or foreground the app (xcrun simctl launch <udid> <bundleId>), then retry.",
            );
          }
          // Not confirmed, so keep polling rather than failing a wait that would have
          // worked. Remember it: a timeout here usually means it really was covered.
          unconfirmedSpringboard = springboard;
        }

        const satisfied = changed
          ? compact !== baseline
          : gone
            ? !JSON.parse(compact).some(matches)
            : JSON.parse(compact).some(matches);
        // Without a cached baseline the first poll only establishes one.
        if (satisfied && !(changed && !hadBaseline && polls === 1)) return compact;

        if (Date.now() + intervalMs >= deadline) {
          const condition = changed ? "ui to change" : `${gone ? "absence of " : ""}${selectorText()}`;
          const scrolled = params.scroll ? `, ${polls - 1} scrolls` : "";
          const covered = unconfirmedSpringboard
            ? `\n${unconfirmedSpringboard} was on top during this wait; the app was probably never in the foreground.`
            : "";
          throw new Error(`timed out after ${params.timeout ?? 15}s (${polls} polls${scrolled}) waiting for ${condition}${covered}`);
        }
        // Scrolling only helps a target that has yet to become visible.
        if (params.scroll && !gone && !changed) {
          await swipePreset(params.udid, params.scroll);
          // A scroll that changes nothing means the end of the list, or a modal
          // sitting on top. Either way the remaining budget is pure waste. A screen
          // that is merely still loading is also static, so allow several in a row
          // before giving up: two was eager enough to abort a list mid-render.
          barrenScrolls = compact === lastBeforeScroll ? barrenScrolls + 1 : 0;
          lastBeforeScroll = compact;
          if (barrenScrolls >= 4) {
            throw new Error(
              `scrolling stopped changing the screen after ${polls} polls, so ${selectorText()} cannot be reached. ` +
              "Either the list has ended or something (a modal?) is covering it.",
            );
          }
        }
        await delay(intervalMs);
      }
    },
  },
  {
    name: "tap",
    summary: "Tap by id, label, value, or raw coordinates.",
    inputSchema: schema({
      udid,
      id: str("Tap the element with this accessibility identifier."),
      label: str("Tap the element with this accessibility label."),
      value: str("Tap the element with this value."),
      x: int("X coordinate for a raw tap."),
      y: int("Y coordinate for a raw tap."),
      element_type: str("Filter matches to a type (Button, TextField, Switch)."),
      wait_timeout: num("Seconds to wait for the element to appear before tapping."),
      poll_interval: num("Seconds between selector polls while waiting."),
      describe_after: bool("Print the resulting screen after tapping."),
      pre_delay: num("Delay in seconds before tapping."),
      post_delay: num("Delay in seconds after tapping."),
    }, ["udid"]),
    async run(params) {
      const hasX = params.x !== undefined;
      const hasY = params.y !== undefined;
      if (hasX !== hasY) throw new Error("tap requires both --x and --y");
      if (!hasX && !params.id && !params.label && !params.value) {
        throw new Error("tap requires coordinates or a selector: --id, --label, or --value");
      }

      const args = ["tap", "--udid", params.udid];
      push(args, "--id", params.id);
      push(args, "--label", params.label);
      push(args, "--value", params.value);
      if (hasX) args.push("-x", String(params.x), "-y", String(params.y));
      push(args, "--element-type", params.element_type);
      push(args, "--wait-timeout", params.wait_timeout);
      push(args, "--poll-interval", params.poll_interval);
      push(args, "--pre-delay", params.pre_delay);
      push(args, "--post-delay", params.post_delay);

      let tapResult;
      try {
        tapResult = await runAxe(args);
      } catch (error) {
        // Flutter reports one widget as several accessibility nodes, so a selector can
        // be "ambiguous" while every match sits on the same point. That is tappable.
        const point = await unambiguousPoint(error, params);
        if (!point) throw error;
        const pointArgs = ["tap", "--udid", params.udid, "-x", String(point[0]), "-y", String(point[1])];
        push(pointArgs, "--pre-delay", params.pre_delay);
        push(pointArgs, "--post-delay", params.post_delay);
        tapResult = `${await runAxe(pointArgs)} (selector matched several nodes sharing one point)`;
      }
      if (!params.describe_after) return tapResult;

      return JSON.stringify({ tap: tapResult, ui: JSON.parse(await describeUi(params.udid)) });
    },
  },
  {
    name: "batch",
    summary: "Run several steps in one call, then optionally print the resulting screen. One round trip instead of one per step.",
    inputSchema: schema({
      udid,
      step: {
        type: "array",
        description: "A step, in axe syntax: 'tap --id BackButton', 'type hello', 'gesture scroll-down'. Repeat for each.",
        items: { type: "string" },
      },
      file: str("Read steps from a file, one per line."),
      continue_on_error: bool("Keep going when a step fails."),
      wait_timeout: num("Seconds a selector step waits for its element."),
      describe_after: bool("Print the resulting screen, so the batch doubles as the describe you were going to run next."),
    }, ["udid"]),
    async run(params) {
      const steps = params.step ?? [];
      if (Boolean(steps.length) === Boolean(params.file)) {
        throw new Error("batch takes either --step (repeated) or --file, not both and not neither");
      }

      const args = ["batch", "--udid", params.udid];
      push(args, "--file", params.file);
      if (params.continue_on_error) args.push("--continue-on-error");
      push(args, "--wait-timeout", params.wait_timeout);
      for (const step of steps) args.push("--step", step);

      // Deliberately not retried on an accessibility failure: a batch that died halfway
      // has already applied its first steps, and replaying them repeats their effects.
      const result = await runAxe(args, 120000);
      if (!params.describe_after) return result;
      return JSON.stringify({ batch: result, ui: JSON.parse(await describeUi(params.udid)) });
    },
  },
  {
    name: "gesture",
    summary: "Preset gestures: scroll-up, scroll-down, scroll-left, scroll-right, swipe-from-*-edge.",
    inputSchema: schema({
      udid,
      preset: enumOf([
        "scroll-up",
        "scroll-down",
        "scroll-left",
        "scroll-right",
        "swipe-from-left-edge",
        "swipe-from-right-edge",
        "swipe-from-top-edge",
        "swipe-from-bottom-edge",
      ], "Gesture to execute."),
      duration: num("Duration in seconds."),
      pre_delay: num("Delay in seconds before the gesture."),
      post_delay: num("Delay in seconds after the gesture."),
    }, ["udid", "preset"]),
    run: (params) => swipePreset(params.udid, params.preset, params),
  },
];

// --- CLI ---------------------------------------------------------------------

const udidCachePath = "/tmp/ma-udid";

const resolveUdid = async () => {
  const cached = fs.existsSync(udidCachePath) ? fs.readFileSync(udidCachePath, "utf8").trim() : "";
  if (cached) return cached;

  const output = await runProcess("/usr/bin/xcrun", ["simctl", "list", "devices", "booted", "-j"], 15000);
  const booted = Object.values(JSON.parse(output).devices).flat().filter((device) => device.state === "Booted");
  if (booted.length !== 1) {
    throw new Error(booted.length ? "several booted simulators; pass --udid" : "no booted simulator");
  }
  fs.writeFileSync(udidCachePath, booted[0].udid);
  return booted[0].udid;
};

const flagOf = (key) => `--${key.replace(/_/g, "-")}`;

const parseArgs = (command, argv) => {
  const properties = command.inputSchema.properties;
  const params = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);

    const key = token.slice(2).replace(/-/g, "_");
    const spec = properties[key];
    if (!spec) throw new Error(`unknown option: ${token}`);
    if (spec.type === "boolean") {
      params[key] = true;
      continue;
    }

    index += 1;
    const value = argv[index];
    if (value === undefined) throw new Error(`missing value for ${token}`);
    if (spec.type === "array") {
      (params[key] ??= []).push(value);
    } else if (spec.type === "integer" || spec.type === "number") {
      // NaN slips through every comparison: a NaN --timeout made `wait` poll forever.
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error(`${token} needs a number, got: ${value}`);
      params[key] = number;
    } else {
      params[key] = value;
    }
  }
  return params;
};

const usage = () => [
  "ma <command> [--flag value]    everything else: axe help",
  "",
  ...commands.flatMap((command) => [
    `  ${command.name}`,
    `      ${command.summary}`,
    `      ${Object.keys(command.inputSchema.properties).map(flagOf).join(" ")}`,
  ]),
].join("\n");

const main = async () => {
  const [name, ...argv] = process.argv.slice(2);
  if (!name || ["help", "--help", "-h"].includes(name)) return usage();

  const command = commands.find((candidate) => candidate.name === name);
  if (!command) throw new Error(`unknown command: ${name}\n\n${usage()}`);

  const params = parseArgs(command, argv);
  if (command.inputSchema.required.includes("udid") && !params.udid) params.udid = await resolveUdid();
  return command.run(params);
};

main()
  .then((output) => { if (output) process.stdout.write(`${output}\n`); })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
