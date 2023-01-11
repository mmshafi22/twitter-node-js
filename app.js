const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB ERROR : ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "ShafiToken", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const inToArr = (List) => {
  let arr = [];
  for (let each in List) {
    arr.push(each.username);
  }
  return { likes: arr };
};

//register//
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addingQuery = `INSERT INTO 
                        user  (username,password,name,gender)
                     VALUES(
                         '${username}',
                         '${hashedPassword}',
                         '${name}',
                         '${gender}'
                     );`;
      await db.run(addingQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});
//login//
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUser = `SELECT 
        * 
     FROM 
        user
     WHERE username = '${username}';`;
  const dbUser = await db.get(selectUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatched = await bcrypt.compare(password, dbUser.password);
    if (isMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "ShafiToken");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

//latest tweet API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const getFollowingUserQuery = `
                        SELECT 
                            username,tweet,date_time as dateTime 
                        FROM 
                            (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T
                            INNER JOIN tweet ON T.following_user_id = tweet.user_id
                        WHERE 
                            follower.follower_user_id = ${user.userId}
                        ORDER BY username DESC
                        LIMIT 4;`;
  const latestTweets = await db.all(getFollowingUserQuery);
  response.status(200);
  response.send(latestTweets);
});
//get follwing name
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const getNamesQuery = `
                    SELECT 
                        name
                    FROM 
                        user INNER JOIN follower ON user.user_id = follower.following_user_id
                    WHERE 
                        follower.follower_user_id = ${user.userId};`;
  const followingNames = await db.all(getNamesQuery);
  response.status(200);
  response.send(followingNames);
});
//get Names followers API
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const getFollowersNamesQuery = `
                            SELECT 
                                name
                            FROM 
                                user INNER JOIN follower ON user.user_id = follower.follower_user_id
                            WHERE 
                                follower.following_user_id = ${user.userId};`;
  const followersNames = await db.all(getFollowersNamesQuery);
  response.status(200);
  response.send(followersNames);
});
//tweets API
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const getTweetsQuery = `
                    SELECT 
                        tweet,COUNT(like_id) as likes,COUNT(reply_id) as replies,tweet.date_time as dateTime
                    FROM 
                        ((follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T 
                        INNER JOIN reply ON T.tweet_id = reply.tweet_id) AS L 
                        INNER JOIN like ON L.tweet_id = like.tweet_id
                    WHERE 
                        follower.follower_user_id = ${user.userId} AND tweet.tweet_id = ${tweetId};`;
  const tweetsList = await db.get(getTweetsQuery);
  if (tweetsList.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.status(200);
    response.send(tweetsList);
  }
});
//get names who like API
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
    const user = await db.get(getUserIdQuery);
    const getUsernamesQuery = `
                    SELECT username 
                    FROM 
                    ((follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T 
                    INNER JOIN like ON T.user_id = like.user_id) AS L INNER JOIN user ON L.user_id = user.user_id
                    WHERE 
                        follower.follower_user_id = ${user.userId} AND 
                        tweet.tweet_id = ${tweetId}
                    GROUP BY username;`;

    const likedNames = await db.all(getUsernamesQuery);
    console.log(likedNames);
    if (likedNames.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.status(200);
      response.send(inToArr(likedNames));
    }
  }
);
//replies APi
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
    const user = await db.get(getUserIdQuery);
    const getRepliesQuery = `
                    SELECT 
                        name , reply
                    FROM 
                    ((follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id) AS T 
                    INNER JOIN reply ON T.user_id = reply.user_id) AS L INNER JOIN user ON L.user_id = user.user_id
                    WHERE 
                        follower.follower_user_id = ${user.userId}
                        AND tweet.tweet_id = ${tweetId}
                    GROUP BY 
                        name,reply;`;
    const repliesList = await db.all(getRepliesQuery);
    if (repliesList.length === 0) {
      response.status(401);
      response.send("Inavlid Request");
    } else {
      response.status(200);
      response.send(repliesList);
    }
  }
);

//all tweets
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const getUserTweetsQuery = `
                    SELECT 
                        tweet.tweet_id,tweet ,COUNT(like_id) as likes, COUNT(reply_id) as replies, tweet.date_time AS dateTime
                    FROM 
                        (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) AS T INNER JOIN reply ON T.tweet_id = reply.tweet_id
                    WHERE
                        tweet.user_id = ${user.userId}
                    GROUP BY
                        tweet;`;
  const userTweetsList = await db.all(getUserTweetsQuery);
  response.status(200);
  response.send(userTweetsList);
});

//delete tweet APi
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserIdQuery);
  const addingQuery = `
            INSERT INTO 
                tweet (tweet,user_id)
            VALUES (
                '${tweet}',
                ${user.userId}
            );`;
  await db.run(addingQuery);
  response.status(200);
  response.send("Created a Tweet");
});
//delete API
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id as userId FROM user WHERE username = '${username}';`;
    const user = await db.get(getUserIdQuery);
    const getTweet = `SELECT * FROM tweet WHERE user_id = ${user.userId} AND tweet_id = ${tweetId};`;
    const tweet = await db.get(getTweet);
    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
      await db.run(deleteQuery);
      response.status(200);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
