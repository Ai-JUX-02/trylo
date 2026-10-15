// 判别力夹具（只被测试当文本读，不参与编译）。
// 传输面不得引入网络 / HTTP / 数据库依赖：本包只做 in-process。
import WebSocket from "ws";
import express from "express";
import Database from "better-sqlite3";
import React from "react";
