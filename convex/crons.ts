import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.weekly("roll leagues", { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 5 }, internal.leaderboard.rollLeagues, {});

export default crons;
