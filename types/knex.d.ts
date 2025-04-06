import { Knex } from "knex";
import {
  Country,
  Currency,
  ExchangeRate,
  NewExchangeRateInput,
  NewRoleInput,
  Permission,
  Role,
  User,
} from "./db";

declare module "knex/types/tables" {
  interface Tables {
    role: Knex.CompositeTableType<
      Role,
      NewRoleInput,
      Partial<Omit<Role, "id">>
    >;

    permission: Permission;
    currency: Currency;
    country: Country;

    exchange_rate: Knex.CompositeTableType<
      ExchangeRate,
      NewExchangeRateInput,
      Partial<Omit<ExchangeRate, "id">>
    >;

    user: User;
  }
}
