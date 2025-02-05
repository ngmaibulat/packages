import Table from "cli-table3";

// Create a new table with some settings
const table = new Table({
  head: ["ID", "Name", "Age"],
  colWidths: [10, 20, 10],
});

// Add rows to the table
table.push([1, "Alice", 30], [2, "Bob", 25], [3, "Charlie", 35]);

// Display the table
console.log(table.toString());
