import "dotenv/config";
import axios from "axios";
import { resolve, dirname, join } from "path";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";

const SPLITWISE_API_URL = "https://secure.splitwise.com/api/v3.0";
const SPLITWISE_PAGE_SIZE = 3000;

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

function format(number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(number);
}

async function run(fetch = false) {
  const expenses = await getExpenses(fetch);

  let total = 0;
  let paid = 0;
  let owed = 0;

  expenses.forEach((expense) => {
    total += parseFloat(expense.cost);

    expense.users.forEach((user) => {
      if (user.user_id !== parseInt(process.env.SPLITWISE_USER_ID)) {
        return;
      }

      paid += parseFloat(user.paid_share);
      owed += parseFloat(user.owed_share);
    });
  });

  console.info(`Total: ${format(total)}`);
  console.info(`Your paid share: ${format(paid)}`);
  console.info(`Your owed share: ${format(owed)}`);
}

run();
