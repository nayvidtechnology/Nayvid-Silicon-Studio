`timescale 1ns/1ps

module counter_tb;
    logic clk = 1'b0;
    logic rst_n = 1'b0;
    logic enable = 1'b0;
    logic [7:0] count;
    logic done;

    counter #(.WIDTH(8)) dut (
        .clk(clk),
        .rst_n(rst_n),
        .enable(enable),
        .count(count),
        .done(done)
    );

    always #5 clk = ~clk;

    initial begin
        $dumpfile("sim.vcd");
        $dumpvars(0, counter_tb);

        repeat (2) @(posedge clk);
        rst_n <= 1'b1;
        enable <= 1'b1;

        repeat (256) @(posedge clk);
        #1;
        if (done !== 1'b1 || count !== 8'h00) begin
            $display("FAIL: expected wrap/done, count=%0h done=%0b", count, done);
            $fatal(1);
        end

        @(posedge clk);
        #1;
        if (done !== 1'b0 || count !== 8'h01) begin
            $display("FAIL: expected count=1 done=0, count=%0h done=%0b", count, done);
            $fatal(1);
        end

        $display("PASS: counter rollover and done pulse verified");
        $finish;
    end
endmodule
