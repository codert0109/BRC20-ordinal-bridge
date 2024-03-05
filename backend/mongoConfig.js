import { MongoClient } from "mongodb";
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.ATLAS_URI;
const client = new MongoClient(connectionString);
await client.connect();
export const db = client.db("brc20-eth-bridge");
export const requestsCollection = await db.collection("requests");
export const addressesCollection = await db.collection("addresses");
