import { Request, Response } from "express";
import { newUserDirect, newUserInvite } from "../core/types/db.type";
import { errorResponse } from "../utils/utils";
import { createUserDirect, createUserInvite } from "../models/user.model";

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

    // const { invitedBy, input } = req.body;
    // if (!invitedBy || !input || !invitedBy.email || !invitedBy.organizationId) {
    //   return res.status(400).json(errorResponse("Bad Request"));
    // }

    // const parsed = newUserInvite.array().safeParse(input);
    // if (!parsed.success) {
    //   return res
    //     .status(400)
    //     .json(errorResponse("Invalid input", parsed.error.flatten()));
    // }

    // const newlyInvitedUsers = await createUserInvite(invitedBy, parsed.data);

    // if (newlyInvitedUsers.success) {
    //   return res.status(201).json(newlyInvitedUsers);
    // } else {
    //   return res.status(400).json(newlyInvitedUsers);
    // }
  } catch (error) {
    console.error(error);
    res.status(500).json(errorResponse("An unexpected error occurred", error));
  }
};
