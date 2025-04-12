import { Request, Response } from "express";
import { newUserDirect } from "../../types/db.type";
import { errorResponse } from "../../utils/utils";
import { createUserDirect } from "../../models/user.model";

export const signup = async (req: Request, res: Response) => {
  try {
    const parsed = newUserDirect.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json(errorResponse("Invalid input", parsed.error.flatten()));
    }

    const newUser = await createUserDirect(parsed.data);

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
