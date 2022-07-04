import "dotenv/config";
import "colors";
import Table from "cli-table";
import axios from "axios";
import { resolve, dirname, join } from "path";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";

const SPLITWISE_API_URL = "https://secure.splitwise.com/api/v3.0";
const SPLITWISE_PAGE_SIZE = 3000;

async function fetchGroups() {
  const { data } = await axios.get(`${SPLITWISE_API_URL}/get_groups`, {
    params: {
      limit: SPLITWISE_PAGE_SIZE,
    },
    headers: { Authorization: `Bearer ${process.env.SPLITWISE_API_KEY}` },
  });

  return data.groups;
}

async function getGroups(fetch = false) {
  const cachePath = resolve(join(dirname(__dirname), "data"), "groups.json");

  if (fetch || !existsSync(cachePath)) {
    const groups = await fetchGroups();
    await writeFile(cachePath, JSON.stringify(groups));
    return groups;
  }

  const groups = await readFile(cachePath);
  return JSON.parse(groups);
}

async function fetchExpenses(page = 0) {
  const { data } = await axios.get(`${SPLITWISE_API_URL}/get_expenses`, {
    params: {
      limit: SPLITWISE_PAGE_SIZE,
      offset: page * SPLITWISE_PAGE_SIZE,
    },
    headers: { Authorization: `Bearer ${process.env.SPLITWISE_API_KEY}` },
  });

  return data.expenses;
}

async function fetchAllExpenses() {
  let expenses = [];
  let stopped = false;
  let page = 0;

  while (!stopped) {
    const data = await fetchExpenses(page);

    if (data.length > 0) {
      expenses = [...expenses, ...data];
      page++;
    } else {
      stopped = true;
    }
  }

  return expenses;
}

async function getExpenses(fetch = false) {
  const cachePath = resolve(join(dirname(__dirname), "data"), "expenses.json");

  if (fetch || !existsSync(cachePath)) {
    const expenses = await fetchAllExpenses();
    await writeFile(cachePath, JSON.stringify(expenses));
    return expenses;
  }

  const expenses = await readFile(cachePath);
  return JSON.parse(expenses);
}

function format(number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", {
    style: currency ? "currency" : undefined,
    currency: currency || undefined,
  }).format(number);
}

async function run(fetch = false) {
  const noGroup = {};
  const groups = await getGroups(fetch);
  const expenses = await getExpenses(fetch);

  let count = 0;
  let total = 0;
  let paid = 0;
  let owed = 0;

  expenses.forEach((expense) => {
    let group = groups.find((group) => group.id === (expense.group_id || 0)) || noGroup;

    Object.assign(group, {
      total: (group?.total || 0) + parseFloat(expense.cost),
    });

    count++;
    total += parseFloat(expense.cost);

    expense.users.forEach((user) => {
      if (user.user_id !== parseInt(process.env.SPLITWISE_USER_ID)) {
        return;
      }

      Object.assign(group, {
        count: (group?.count || 0) + 1,
        owed: (group?.owed || 0) + parseFloat(user.owed_share),
        paid: (group?.paid || 0) + parseFloat(user.paid_share),
      });

      owed += parseFloat(user.owed_share);
      paid += parseFloat(user.paid_share);
    });
  });

  const table = new Table({
    head: ["Groep".red, "Aantal".red, "Verschuldigd".red, "Betaald".red, "Totaal".red],
    colAligns: ["left", "right", "right", "right", "right"],
  });

  table.push([
    "Geen groep gevonden".yellow,
    format(noGroup?.count || 0, null),
    format(noGroup?.owed || 0),
    format(noGroup?.paid || 0),
    format(noGroup?.total || 0).blue,
  ]);
  groups.forEach((group) => {
    table.push([
      group.name.green,
      format(group?.count || 0, null),
      format(group?.owed || 0),
      format(group?.paid || 0),
      format(group?.total || 0).blue,
    ]);
  });
  table.push(["Totaal".red, format(count, null).red, format(owed).red, format(paid).red, format(total).red]);

  console.log(table.toString());
}

run();
