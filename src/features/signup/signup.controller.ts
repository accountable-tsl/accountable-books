import { Request, Response } from "express";
import { errorResponse } from "../../shared/utils/response.utils";
import knexInstance from "../../../knexClient";
import { registerNewAccount } from "./signup.service";

export const clientSignup = async (req: Request, res: Response) => {
  try {
    console.log(req.body);
    const newUser = await registerNewAccount(knexInstance, req.body.data);
    if (newUser.success) {
      return res.status(201).json(newUser);
    } else {
      return res.status(400).json(newUser);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json(errorResponse("An unexpected error occurred", error));
  }
};
