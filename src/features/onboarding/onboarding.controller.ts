import { Request, Response } from "express";
import { errorResponse } from "../../shared/utils/response.utils";
import { onboardingClientDirect } from "./onboarding.service";
import knexInstance from "../../../knexClient";

export const clientSignup = async (req: Request, res: Response) => {
  try {
    const newUser = await onboardingClientDirect(knexInstance, req.body);
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
