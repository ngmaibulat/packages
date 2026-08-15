import { SMTPServer } from "smtp-server";

// Create an instance of the SMTP server
const server = new SMTPServer({
    authOptional: true, // Allow clients to connect without authentication
    onData(stream, session, callback) {
        // Read the email content from the stream
        let email = "";
        stream.on("data", (chunk) => {
            console.log("receving...");
            email += chunk.toString();
        });

        // Handle the email content when the stream ends
        stream.on("end", () => {
            console.log("Received email:");
            console.log(email);

            // Soft bounce the email by returning a temporary error
            // const error = new Error("451 Temporary failure");
            const error = new Error("No connections from localhost allowed");
            callback(error);
            // callback();
        });
    },
});

// Start the SMTP server
server.listen(2525, () => {
    console.log("SMTP server listening on port 2525");
});
