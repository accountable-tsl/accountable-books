import initKnex from "knex";
import configuration from "../knexfile";
import { response } from "express";
const knex = initKnex(configuration);
