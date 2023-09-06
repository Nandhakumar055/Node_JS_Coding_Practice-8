const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

let DB = null;

const initializationServerAndDb = async () => {
  try {
    DB = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3002, () => {
      console.log("Server Running at http://localhost:3002/");
    });
  } catch (err) {
    console.log(`DB ERROR: ${err.message}`);
    process.exit(1);
  }
};
initializationServerAndDb();

//GETTING USER FOLLOWING PEOPLE ID'S

const getFollowingPeopleIdsOfUser = async (username) => {
  const getFollowingPeopleQuery = `
    SELECT
    following_user_id 
    FROM
    follower
    INNER JOIN
    user ON user.user_id = follower.follower_user_id
    WHERE
    user.username = '${username}';`;
  const followingPeople = await DB.all(getFollowingPeopleQuery);
  const arrayOfId = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  console.log(followingPeople);
  console.log("-------");
  console.log(arrayOfId);
  return arrayOfId;
};

//AUTHORIZATION TOKEN

const authorizationToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authorHeader.split(" ")[1];

    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          request.userId = payload.userId;
          request.tweet = tweet;
          request.payload = payload;
          request.tweetId = tweetId;
          next();
        }
      });
    }
  }
};

//TWEET ACCESS VERIFICATION

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  console.log(userId);
  console.log(tweetId);
  const getTweetQuery = `
    SELECT
    *
    FROM tweet INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE
    tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;

  const tweet = await DB.get(getTweetQuery);

  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//API - 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `
  SELECT
  *
  FROM 
  user
  WHERE
  username = '${username}';`;

  const dbUser = await DB.get(checkUser);

  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
        INSERT INTO 
        user
        (username, password, name, gender)
        VALUES
        ('${username}', '${hashedPassword}', '${name}', '${gender}');`;

      await DB.run(createUserQuery);
      response.send("User created successfully");
    }
  }
});

//API - 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  console.log(username);
  console.log(password);
  const checkUser = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';`;

  const dbUser = await DB.get(checkUser);

  if (dbUser !== undefined) {
    const passwordMatch = await bcrypt.compare(password, dbUser.password);
    if (passwordMatch === true) {
      const jwtToken = jwt.sign(dbUser, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API - 3

app.get("/user/tweets/feed/", authorizationToken, async (request, response) => {
  const { username } = request;

  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username);

  const getTweetQuery = `
    SELECT
    username, tweet, date_time as dateTime
    FROM user 
    INNER JOIN tweet
    ON user.user_id = tweet.user_id
    WHERE
    user.user_id IN (${followingPeopleIds})
    ORDER BY date_time DESC
    LIMIT 4 ;`;

  const tweets = await DB.all(getTweetQuery);
  response.send(tweets);
});

//API -4

app.get("/user/following/", authorizationToken, async (request, response) => {
  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  const getFollowingUserQuery = `
    SELECT 
    name
    FROM follower
    INNER JOIN user
    ON
    user.user_id = follower.following_user_id
    WHERE 
    follower.follower_user_id = '${user_id}';`;

  const followingPeople = await DB.all(getFollowingUserQuery);
  response.send(followingPeople);
});

// API - 5

app.get("/user/followers/", authorizationToken, async (request, response) => {
  const { payload } = request;

  const { user_id, name, username, gender } = payload;

  const getFollowerQuery = `
    SELECT 
    DISTINCT name
    FROM follower
    INNER JOIN user
    ON
    user.user_id = follower.follower_user_id
    WHERE 
    following_user_id = '${user_id}';`;

  const followingPeople = await DB.all(getFollowerQuery);
  response.send(followingPeople);
});

//API - 6

app.get(
  "/tweets/:tweetId/",
  authorizationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username, user_id } = request;

    console.log(tweetId);
    console.log(user_id, username);

    const getTweetQuery = `
    SELECT tweet,
    (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
    (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
    date_time AS dateTime
    FROM tweet
    WHERE
    tweet.tweet_id = '${tweetId}';`;
    const getTweetDetails = DB.get(getTweetQuery);
    response.send(getTweetDetails);
  }
);

//API - 7

app.get(
  "/tweets/:tweetId/likes/",
  authorizationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;

    const getLikeQuery = `
    SELECT username
    FROM user INNER JOIN like ON user.user_id = like.user_id
    WHERE
    tweet_id = '${tweetId}';`;
    const likedUsers = DB.all(getLikeQuery);
    const userArray = likedUsers.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

//API - 8

app.get(
  "/tweets/:tweetId/replies/",
  authorizationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;

    const getRepliesQuery = `
    SELECT name, reply
    FROM user INNER JOIN reply ON user.user_id = reply.user_id
    WHERE
    tweet_id = '${tweetId}';`;
    const repliedUsers = DB.all(getRepliesQuery);
    response.send({ replies: repliedUsers });
  }
);

//API - 9

app.get("/user/tweets/", authorizationToken, async (request, response) => {
  const userId = parseInt(request.userId);

  console.log(userId);
  const getTweetsQuery = `
    SELECT tweet,
    COUNT(DISTINCT like_id) AS likes,
    COUNT(DISTINCT reply_id) AS replies,
    date_time AS dateTime
    FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    WHERE tweet.user_id = '${userId}'
    GROUP BY tweet.tweet_id;`;

  const tweets = await DB.all(getTweetsQuery);
  response.send(tweets);
});

// API - 10

app.post("/user/tweets/", authorizationToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  console.log(userId);
  console.log(dateTime);
  const creatTweetQuery = `
    INSERT INTO tweet(tweet, user_id, date_time)
    VALUES('${tweet}','${userId}','${dateTime}');`;
  await DB.run(creatTweetQuery);
  response.send("Created a Tweet");
});

// API - 11

app.delete(
  "/tweets/:tweetId/",
  authorizationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;

    const getTheTweetQuery = `
    SELECT
    *
    FROM tweet 
    WHERE
    user_id = '${userId}' AND tweet_id = '${tweetId}';`;

    const tweet = await DB.get(getTheTweetQuery);
    console.log(tweet);

    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await DB.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
